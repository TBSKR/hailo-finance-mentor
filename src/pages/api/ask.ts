import { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { withApiKeyAuth } from '../../middleware/auth'; // Import the auth middleware

// Configure Multer for temporary audio file storage
const upload = multer({ 
    dest: '/tmp/',
    limits: { fileSize: 10 * 1024 * 1024 } // Limit file size to 10MB
});

// Helper function to run middleware
const runMiddleware = (req: NextApiRequest, res: NextApiResponse, fn: any) => {
  return new Promise((resolve, reject) => {
    fn(req, res, (result: any) => {
      if (result instanceof Error) {
        return reject(result);
      }
      return resolve(result);
    });
  });
};

// Define the core API route handler logic
const askHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  let audioFilePath: string | undefined = undefined;

  try {
    // Run Multer middleware to handle file upload
    await runMiddleware(req, res, upload.single('audio')); // 'audio' is the field name

    // @ts-ignore - file is added by multer
    const audioFile = req.file;
    const question = req.body.question; // Optional question from form data

    if (!audioFile) {
      return res.status(400).json({ error: 'No audio file uploaded.' });
    }

    audioFilePath = audioFile.path; // Store path for cleanup

    // Check for required environment variables
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeEnvironment = process.env.PINECONE_ENVIRONMENT;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const pineconeIndexName = 'hailo-finance-index';

    if (!pineconeApiKey || !pineconeEnvironment || !openaiApiKey) {
      console.error('Missing required environment variables (Pinecone/OpenAI)');
      return res.status(500).json({ error: 'Server configuration error: Missing API keys.' });
    }

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey: openaiApiKey });

    // 1. Transcribe audio using Whisper API
    let transcription = '';
    try {
      const transcriptResponse = await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioFilePath),
        model: 'whisper-1',
      });
      transcription = transcriptResponse.text;
      console.log('Transcription:', transcription);
    } catch (transcriptionError: any) {
      console.error('Whisper API Error:', transcriptionError);
      return res.status(500).json({ error: 'Failed to transcribe audio.', details: transcriptionError.message });
    }

    // Clean up temporary audio file after transcription
    if (audioFilePath && fs.existsSync(audioFilePath)) {
        fs.unlinkSync(audioFilePath);
        audioFilePath = undefined; // Reset path after deletion
    }

    // Determine the final query: use provided question or transcription
    const queryText = question || transcription;
    if (!queryText) {
        return res.status(400).json({ error: 'No query provided (either question text or audio transcription).' });
    }

    // 2. Retrieve relevant context from Pinecone
    let context = '';
    try {
      const pinecone = new Pinecone({ apiKey: pineconeApiKey });
      const index = pinecone.index(pineconeIndexName);
      const embeddings = new OpenAIEmbeddings({ 
          openAIApiKey: openaiApiKey,
          modelName: "text-embedding-3-small" // As specified
      });

      // Generate embedding for the query
      const queryEmbedding = await embeddings.embedQuery(queryText);

      // Query Pinecone
      const queryResponse = await index.query({
        vector: queryEmbedding,
        topK: 5, // Retrieve top 5 relevant chunks
        includeMetadata: true,
      });

      // Format context from retrieved chunks
      context = queryResponse.matches
        ?.map((match) => match.metadata?.text)
        .filter(Boolean)
        .join('\n\n---\n\n') || 'No relevant context found.';

      console.log(`Retrieved context for query: "${queryText}"`);

    } catch (pineconeError: any) {
      console.error('Pinecone Query Error:', pineconeError);
      // Proceed without context, log the error
      context = 'Error retrieving context from knowledge base.';
      // Optionally return error: return res.status(500).json({ error: 'Failed to retrieve context from Pinecone.', details: pineconeError.message });
    }

    // 3. Call GPT-4o with system prompt, context, and query
    const systemPrompt = `You are a finance professor.
Think step-by-step in <scratchpad>...</scratchpad> then after ### give the final answer.
Use the following context to answer the question:

Context:
${context}`; // Include retrieved context here

    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: queryText },
        ],
        // Adjust parameters as needed
        // temperature: 0.7,
        // max_tokens: 500,
      });

      const responseContent = completion.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('No response content from GPT-4o');
      }

      // Extract scratchpad and final answer
      const scratchpadMatch = responseContent.match(/<scratchpad>([\s\S]*?)<\/scratchpad>/);
      const scratchpad = scratchpadMatch ? scratchpadMatch[0] : 'No scratchpad content found.';
      // Improved final answer extraction: remove scratchpad block if ### is missing
      const finalAnswer = responseContent.split('###')?.[1]?.trim() || responseContent.replace(/<scratchpad>([\s\S]*?)<\/scratchpad>/, '').trim(); 

      res.status(200).json({ answer: finalAnswer, scratchpad: scratchpad, transcription: transcription });

    } catch (gptError: any) {
      console.error('GPT-4o API Error:', gptError);
      return res.status(500).json({ error: 'Failed to get answer from AI model.', details: gptError.message });
    }

  } catch (error: any) {
    console.error('Ask API Error:', error);
    // Ensure temporary file is cleaned up on any error
    if (audioFilePath && fs.existsSync(audioFilePath)) {
        fs.unlinkSync(audioFilePath);
    }
    // Handle specific errors (e.g., Multer errors)
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Audio file size limit exceeded.' });
    }
    // Generic error
    res.status(500).json({ error: 'Failed to process the request.', details: error.message || 'Unknown error' });
  }
};

// Disable Next.js body parsing for this route
export const config = {
  api: {
    bodyParser: false,
  },
};

// Wrap the handler with the API key authentication middleware
export default withApiKeyAuth(askHandler);
