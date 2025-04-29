import { NextApiRequest, NextApiResponse } from 'next';
import multer from 'multer';
import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PDFLoader } from '@langchain/community/document_loaders/fs/pdf';
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import path from 'path';
import fs from 'fs';
import { withApiKeyAuth } from '../../middleware/auth'; // Import the auth middleware

// Ensure the docs directory exists
const docsDir = path.join(process.cwd(), 'docs');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

// Configure Multer for file storage
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, docsDir);
  },
  filename: function (req, file, cb) {
    // Use original name - ensure it's sanitized in a real app
    cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_')); // Replace spaces
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // Limit file size to 20MB
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      // @ts-ignore
      cb(new Error('Only PDF files are allowed!'));
    }
  }
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
const uploadHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  let filePath: string | undefined = undefined;

  try {
    // Run Multer middleware
    await runMiddleware(req, res, upload.single('file')); // 'file' is the field name

    // @ts-ignore - file is added by multer
    const uploadedFile = req.file;

    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    filePath = uploadedFile.path; // Store path for cleanup
    const fileName = uploadedFile.originalname;

    // Check for required environment variables
    const pineconeApiKey = process.env.PINECONE_API_KEY;
    const pineconeEnvironment = process.env.PINECONE_ENVIRONMENT;
    const openaiApiKey = process.env.OPENAI_API_KEY;
    const pineconeIndexName = 'hailo-finance-index'; // As specified

    if (!pineconeApiKey || !pineconeEnvironment || !openaiApiKey) {
      console.error('Missing required environment variables (Pinecone API Key, Environment, or OpenAI API Key)');
      return res.status(500).json({ error: 'Server configuration error: Missing API keys.' });
    }

    // Initialize Pinecone
    const pinecone = new Pinecone({
        apiKey: pineconeApiKey,
    });

    // Select the Pinecone index
    // Note: Assumes index exists. In production, check existence or handle creation.
    const index = pinecone.index(pineconeIndexName);

    // Initialize OpenAI Embeddings
    const embeddings = new OpenAIEmbeddings({ 
        openAIApiKey: openaiApiKey,
        modelName: "text-embedding-3-small" // As specified in requirements
    });

    // Load PDF
    const loader = new PDFLoader(filePath);
    let docs;
    try {
        docs = await loader.load();
    } catch (pdfLoadError: any) {
        console.error(`Failed to load PDF: ${fileName}`, pdfLoadError);
        return res.status(500).json({ error: `Could not process PDF: ${fileName}`, details: pdfLoadError.message });
    }

    if (!docs || docs.length === 0) {
        console.error(`No content extracted from PDF: ${fileName}`);
        return res.status(500).json({ error: `Could not extract content from PDF: ${fileName}` });
    }

    // Split document into chunks
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await textSplitter.splitDocuments(docs);

    // Generate embeddings and prepare for Pinecone upsert
    const vectors = [];
    try {
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          const embedding = await embeddings.embedQuery(chunk.pageContent);
          vectors.push({
            id: `${fileName}-chunk-${i}`,
            values: embedding,
            metadata: {
              text: chunk.pageContent,
              source: fileName,
              pageNumber: chunk.metadata.loc?.pageNumber || 0,
            },
          });
        }
    } catch (embeddingError: any) {
        console.error('Error generating embeddings:', embeddingError);
        return res.status(500).json({ error: 'Failed to generate embeddings.', details: embeddingError.message });
    }

    // Upsert vectors to Pinecone
    if (vectors.length > 0) {
        try {
            const batchSize = 100; // Pinecone recommendation
            for (let i = 0; i < vectors.length; i += batchSize) {
                const batch = vectors.slice(i, i + batchSize);
                await index.upsert(batch);
            }
            console.log(`Successfully embedded and upserted ${vectors.length} chunks from ${fileName}`);
        } catch (pineconeError: any) {
            console.error('Error upserting to Pinecone:', pineconeError);
            return res.status(500).json({ error: 'Failed to save embeddings to database.', details: pineconeError.message });
        }
    } else {
        console.log(`No text chunks found to embed for ${fileName}`);
    }

    // Optionally, delete the local file after successful processing
    // fs.unlinkSync(filePath);

    res.status(200).json({ message: `File ${fileName} uploaded and processed successfully.`, chunksEmbedded: vectors.length });

  } catch (error: any) {
    console.error('Upload API Error:', error);
    // Ensure cleanup on any error
    if (filePath && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
    }
    // Handle specific errors (e.g., Multer errors)
    if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File size limit exceeded.' });
    }
    if (error instanceof Error && error.message.includes('Only PDF files are allowed')) {
        return res.status(400).json({ error: 'Invalid file type. Only PDFs are allowed.' });
    }
    // Generic error
    res.status(500).json({ error: 'Failed to process the uploaded file.', details: error.message || 'Unknown error' });
  }
};

// Important: Disable Next.js body parsing for this route
export const config = {
  api: {
    bodyParser: false,
  },
};

// Wrap the handler with the API key authentication middleware
export default withApiKeyAuth(uploadHandler);
