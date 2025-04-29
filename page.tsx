
'use client';

import { useState, useCallback, useEffect } from 'react';
import { AudioRecorder, useAudioRecorder } from 'react-audio-voice-recorder';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [asking, setAsking] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [answer, setAnswer] = useState('');
  const [scratchpad, setScratchpad] = useState('');
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [internalApiKey, setInternalApiKey] = useState('');

  const recorderControls = useAudioRecorder();

  // Fetch internal API key on component mount (in a real app, manage this securely)
  useEffect(() => {
    // This is insecure for a real app. Keys should not be exposed client-side.
    // For this POC, we'll use the dummy key from .env.local (which isn't directly accessible here)
    // We'll hardcode the dummy key for now, assuming it matches .env.local
    setInternalApiKey('dummy_internal_key'); 
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type === 'application/pdf') {
        setFile(selectedFile);
        setError('');
      } else {
        setError('Please select a PDF file.');
        setFile(null);
      }
    }
  };

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.files && event.dataTransfer.files[0]) {
      const droppedFile = event.dataTransfer.files[0];
      if (droppedFile.type === 'application/pdf') {
        setFile(droppedFile);
        setError('');
      } else {
        setError('Please drop a PDF file.');
        setFile(null);
      }
    }
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
  }, []);

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a PDF file first.');
      return;
    }
    if (!internalApiKey) {
        setError('Internal API Key not configured.');
        return;
    }

    setUploading(true);
    setUploadStatus('Uploading PDF...');
    setError('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: {
          'X-Internal-Api-Key': internalApiKey,
        },
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || `HTTP error! status: ${response.status}`);
      }

      setUploadStatus(`Successfully uploaded ${file.name}. ${result.chunksEmbedded} chunks embedded.`);
      setFile(null); // Clear file input after successful upload
    } catch (err: any) { {
      console.error('Upload failed:', err);
      setError(`Upload failed: ${err.message}`);
      setUploadStatus('');
    } finally {
      setUploading(false);
    }
  };

  const addAudioElement = async (blob: Blob) => {
    if (!internalApiKey) {
        setError('Internal API Key not configured.');
        return;
    }
    setAsking(true);
    setError('');
    setTranscription('');
    setAnswer('');
    setScratchpad('');
    setAudioUrl(null);

    const formData = new FormData();
    formData.append('audio', blob, 'recording.wav'); // Sending as wav, adjust if needed
    // formData.append('question', 'Optional question text'); // Add if you have a text input for question

    try {
      // 1. Send audio to /api/ask
      const askResponse = await fetch('/api/ask', {
        method: 'POST',
        headers: {
            'X-Internal-Api-Key': internalApiKey,
        },
        body: formData,
      });

      const askResult = await askResponse.json();

      if (!askResponse.ok) {
        throw new Error(askResult.error || `Ask API error! status: ${askResponse.status}`);
      }

      setTranscription(askResult.transcription || 'No transcription available.');
      setAnswer(askResult.answer || 'No answer received.');
      setScratchpad(askResult.scratchpad || 'No scratchpad content.');

      // 2. Send answer text to /api/tts
      if (askResult.answer) {
        setTtsLoading(true);
        const ttsResponse = await fetch('/api/tts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Api-Key': internalApiKey,
          },
          body: JSON.stringify({ text: askResult.answer }),
        });

        if (!ttsResponse.ok) {
          // Try to parse error JSON, otherwise use status text
          let errorDetails = `TTS API error! status: ${ttsResponse.status}`;
          try {
            const ttsErrorResult = await ttsResponse.json();
            errorDetails = ttsErrorResult.error || errorDetails;
          } catch (parseError) {
            // Ignore if response is not JSON
          }
          throw new Error(errorDetails);
        }

        // Get audio blob and create URL
        const audioBlob = await ttsResponse.blob();
        const url = URL.createObjectURL(audioBlob);
        setAudioUrl(url);
      }
    } catch (err: any) {
      console.error('Ask/TTS process failed:', err);
      setError(`Processing failed: ${err.message}`);
    } finally {
      setAsking(false);
      setTtsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-12 bg-gray-50">
      <h1 className="text-4xl font-bold mb-8 text-gray-800">Hailo Finance Mentor</h1>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-700 border border-red-300 rounded w-full max-w-lg">
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}

      {/* PDF Upload Section */}
      <div className="mb-8 p-6 border border-gray-300 rounded-lg bg-white w-full max-w-lg shadow-sm">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Upload Course PDF</h2>
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-gray-400 rounded-lg p-8 text-center mb-4 cursor-pointer hover:border-blue-500 hover:bg-gray-100 transition-colors"
        >
          <input
            type="file"
            accept="application/pdf"
            onChange={handleFileChange}
            className="hidden" // Hide default input, use the div for interaction
            id="pdf-upload-input"
          />
          <label htmlFor="pdf-upload-input" className="cursor-pointer">
            {file ? (
              <p>Selected: {file.name}</p>
            ) : (
              <p>Drag & drop a PDF here, or click to select</p>
            )}
          </label>
        </div>
        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 transition-colors"
        >
          {uploading ? 'Uploading...' : 'Upload PDF'}
        </button>
        {uploadStatus && (
          <p className="mt-3 text-green-600">{uploadStatus}</p>
        )}
      </div>

      {/* Voice Interaction Section */}
      <div className="p-6 border border-gray-300 rounded-lg bg-white w-full max-w-lg shadow-sm">
        <h2 className="text-2xl font-semibold mb-4 text-gray-700">Ask a Question</h2>
        <div className="flex flex-col items-center">
          <AudioRecorder
            onRecordingComplete={addAudioElement}
            audioTrackConstraints={{
              noiseSuppression: true,
              echoCancellation: true,
            }}
            recorderControls={recorderControls}
            // downloadOnSavePress={true}
            // downloadFileExtension="wav"
            showVisualizer={true}
            classes={{
                AudioRecorderClass: 'bg-gray-100 p-4 rounded-lg shadow-inner',
                AudioRecorderStartSaveClass: 'px-3 py-1 bg-green-500 text-white rounded mr-2 hover:bg-green-600',
                AudioRecorderStopSaveClass: 'px-3 py-1 bg-red-500 text-white rounded mr-2 hover:bg-red-600',
                AudioRecorderPauseResumeClass: 'px-3 py-1 bg-yellow-500 text-white rounded mr-2 hover:bg-yellow-600',
                AudioRecorderDiscardClass: 'px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600',
            }}
          />
          {/* <button onClick={recorderControls.stopRecording}>Stop recording</button> */} 
        </div>

        {(asking || ttsLoading) && (
            <div className="mt-4 text-center">
                <p className="text-blue-600 animate-pulse">
                    {asking ? 'Processing your question...' : (ttsLoading ? 'Generating audio...' : '')}
                </p>
            </div>
        )}

        {transcription && (
          <div className="mt-6 p-4 bg-gray-100 rounded-lg">
            <h3 className="font-semibold text-lg mb-2 text-gray-700">You asked:</h3>
            <p className="text-gray-600 italic">{transcription}</p>
          </div>
        )}

        {answer && (
          <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="font-semibold text-lg mb-2 text-blue-800">Answer:</h3>
            <p className="text-gray-800 whitespace-pre-wrap">{answer}</p>
            {audioUrl && (
              <div className="mt-3">
                <audio controls src={audioUrl} className="w-full">
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}
          </div>
        )}

        {scratchpad && (
          <div className="mt-4 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <h3 className="font-semibold text-lg mb-2 text-yellow-800">Scratchpad (AI Thinking Process):</h3>
            <pre className="text-sm text-gray-600 whitespace-pre-wrap overflow-x-auto">{scratchpad}</pre>
          </div>
        )}
      </div>
    </main>
  );
}

