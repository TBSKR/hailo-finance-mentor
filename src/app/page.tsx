'use client'; // Ensure this component is rendered on the client side

import { useState, useRef } from 'react';
import { ReactAudioVoiceRecorder } from 'react-audio-voice-recorder'; // Assuming this is the correct import
import { withApiKeyAuth } from '../../middleware/auth'; // Update path if necessary

// Placeholder for API Key - In a real application, handle this securely
// This is ONLY for client-side testing/development and should NOT be used in production like this.
const INTERNAL_API_KEY = process.env.NEXT_PUBLIC_INTERNAL_API_KEY; // Use NEXT_PUBLIC_ prefix for client-side access

export default function Home() {
  const [uploading, setUploading] = useState(false);
  const [asking, setAsking] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [transcription, setTranscription] = useState('');
  const [answer, setAnswer] = useState('');
  const [scratchpad, setScratchpad] = useState('');

  const audioRef = useRef<HTMLAudioElement>(null); // Ref for the audio player

  // --- PDF Upload Handlers ---

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setUploadStatus('Uploading...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
            'X-Internal-API-Key': INTERNAL_API_KEY || '', // Add API key header
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setUploadStatus(result.message || 'File uploaded successfully.');

    } catch (err: any) {
      console.error('Upload failed:', err);
      setError(`Upload failed: ${err.message}`);
      setUploadStatus('');
    } finally { // Added semicolon here if it was missing before
      setUploading(false);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    // Add visual feedback if needed
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFileUpload(files[0]); // Process only the first dropped file
    }
    // Remove visual feedback if needed
  };

  // --- Voice Recording & Ask Handlers ---

  // Function called when recording is finished
  const onRecordingComplete = async (blob: Blob) => {
    console.log('Recording complete:', blob);
    setAsking(true);
    setError(null);
    setTranscription('');
    setAnswer('');
    setScratchpad('');

    const formData = new FormData();
    formData.append('audio', blob, 'recording.webm'); // Append the audio blob

    try {
      const response = await fetch('/api/ask', {
        method: 'POST',
        headers: {
            'X-Internal-API-Key': INTERNAL_API_KEY || '', // Add API key header
        },
        body: formData,
      });

      if (!response.ok) {
         const errorData = await response.json();
         throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setTranscription(result.transcription || 'No transcription available.');
      setAnswer(result.answer || 'Could not retrieve an answer.');
      setScratchpad(result.scratchpad || 'No scratchpad available.');

      // Once we have the answer, trigger TTS
      if (result.answer) {
          await handleTextToSpeech(result.answer);
      }

    } catch (err: any) {
      console.error('Ask API failed:', err);
      setError(`Ask API failed: ${err.message}`);
    } finally {
      setAsking(false);
    }
  };

  // --- Text-to-Speech Handler ---

  const handleTextToSpeech = async (text: string) => {
      if (!text) return;

      setTtsLoading(true);
      setError(null);

      try {
          const response = await fetch('/api/tts', {
              method: 'POST',
              headers: {
                  'Content-Type': 'application/json',
                  'X-Internal-API-Key': INTERNAL_API_KEY || '', // Add API key header
              },
              body: JSON.stringify({ text: text }),
          });

          if (!response.ok) {
              const errorData = await response.json();
              throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          }

          // Get the audio blob from the response
          const audioBlob = await response.blob();
          const audioUrl = URL.createObjectURL(audioBlob);

          // Play the audio
          if (audioRef.current) {
              audioRef.current.src = audioUrl;
              audioRef.current.play();
          }

      } catch (err: any) {
          console.error('TTS API failed:', err);
          setError(`TTS API failed: ${err.message}`);
      } finally {
          setTtsLoading(false);
      }
  };


  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <h1 className="text-4xl font-bold mb-8">Hailo Finance Mentor</h1>

      {/* PDF Upload Section */}
      <section className="mb-12 w-full max-w-2xl">
        <h2 className="text-2xl font-semibold mb-4">Upload Documenten (PDF)</h2>
        <div
          className="border-2 border-dashed border-gray-400 p-8 text-center cursor-pointer"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => document.getElementById('fileInput')?.click()}
        >
          {uploading ? (
            <p>Uploaden: {uploadStatus || 'Bezig...'}</p>
          ) : (
            <>
              <p>Sleep een PDF-bestand hierheen, of klik om te selecteren.</p>
              <input
                id="fileInput"
                type="file"
                accept=".pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
            </>
          )}
        </div>
         {uploadStatus && !uploading && <p className="mt-2 text-green-600">{uploadStatus}</p>}
      </section>

      {/* Voice Input Section */}
      <section className="mb-12 w-full max-w-2xl text-center">
        <h2 className="text-2xl font-semibold mb-4">Stel een Vraag (Spraak)</h2>
        {/* react-audio-voice-recorder component */}
        <ReactAudioVoiceRecorder
            onRecordingComplete={onRecordingComplete}
            // Optional props for styling or functionality
            // recorderParams={{ audioBitsPerSecond: 128000 }} // Example
            // showFileDetails={true}
        />
        {asking && <p className="mt-4">Verwerken van vraag en antwoord...</p>}
        {ttsLoading && <p className="mt-4">Genereren van spraakantwoord...</p>}
         {/* Audio Player */}
        <audio ref={audioRef} controls className="mt-4 w-full"></audio>
      </section>


      {/* Output Section */}
      {(transcription || answer || scratchpad || error) && (
        <section className="w-full max-w-2xl mt-8">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative mb-4" role="alert">
              <strong className="font-bold">Fout:</strong>
              <span className="block sm:inline"> {error}</span>
            </div>
          )}

          {transcription && (
            <div className="mb-4">
              <h3 className="text-xl font-semibold mb-2">Transcriptie:</h3>
              <p className="p-4 bg-gray-100 rounded">{transcription}</p>
            </div>
          )}

          {answer && (
             <div className="mb-4">
              <h3 className="text-xl font-semibold mb-2">Antwoord:</h3>
              <p className="p-4 bg-blue-100 rounded">{answer}</p>
            </div>
          )}

          {scratchpad && (
            <div className="mb-4">
              <h3 className="text-xl font-semibold mb-2">Scratchpad (AI denkproces):</h3>
              <pre className="p-4 bg-yellow-100 rounded whitespace-pre-wrap">{scratchpad}</pre>
            </div>
          )}
        </section>
      )}

    </main>
  ); // Added closing brace for the Home function here if it was missing
}