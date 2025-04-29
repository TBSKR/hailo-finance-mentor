import { NextApiRequest, NextApiResponse } from 'next';
import { ElevenLabs } from 'elevenlabs';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { withApiKeyAuth } from '../../middleware/auth'; // Import the auth middleware

// Define the core API route handler logic
const ttsHandler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  let tempFilePath: string | undefined = undefined;

  try {
    // Parse request body
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({ error: 'Text parameter is required and must be a string.' });
    }

    // Check for required environment variables
    const elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;
    if (!elevenLabsApiKey) {
      console.error('Missing required environment variable: ELEVENLABS_API_KEY');
      return res.status(500).json({ error: 'Server configuration error: Missing ElevenLabs API key.' });
    }

    // Initialize ElevenLabs client
    const elevenlabs = new ElevenLabs({
      apiKey: elevenLabsApiKey,
    });

    // Create a temporary file path for the audio
    const tempDir = os.tmpdir();
    tempFilePath = path.join(tempDir, `tts-${Date.now()}.mp3`);

    try {
      // Generate audio using ElevenLabs TTS
      const defaultVoiceId = 'EXAVITQu4vr4xnSDxMaL'; // Adam voice (or choose another suitable voice)
      
      // Generate audio stream
      const audioStream = await elevenlabs.textToSpeech({
        voiceId: defaultVoiceId,
        textInput: text,
        modelId: 'eleven_multilingual_v2', // Use appropriate model
        outputFormat: 'mp3_44100_128', // Standard MP3 format
      });
      
      // Write the audio stream to a file
      fs.writeFileSync(tempFilePath, Buffer.from(await audioStream.arrayBuffer()));
      
      // Read the file and send it as a response
      const audioBuffer = fs.readFileSync(tempFilePath);
      
      // Set appropriate headers
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Content-Disposition', 'attachment; filename="speech.mp3"'); // Suggest filename
      
      // Send the audio file
      res.status(200).send(audioBuffer);
      
      // Clean up the temporary file after successful sending
      if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
          tempFilePath = undefined;
      }
      
    } catch (ttsError: any) {
      console.error('ElevenLabs TTS Error:', ttsError);
      // Ensure cleanup even if TTS fails
      if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
      }
      return res.status(500).json({ 
        error: 'Failed to generate speech from text.', 
        details: ttsError.message || 'Unknown TTS error' 
      });
    }

  } catch (error: any) {
    console.error('TTS API Error:', error);
    // Ensure cleanup on any generic error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
    }
    res.status(500).json({ 
      error: 'Failed to process the request.', 
      details: error.message || 'Unknown error' 
    });
  }
};

// Wrap the handler with the API key authentication middleware
export default withApiKeyAuth(ttsHandler);
