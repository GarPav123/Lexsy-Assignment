import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Sparkles, Zap, Star, ArrowRight, Play, Upload, FileText } from 'lucide-react';

interface Placeholder {
  name: string;
  filled: boolean;
}

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  suggestions?: string[];
}

const App: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [placeholders, setPlaceholders] = useState<Placeholder[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);
  const [documentReady, setDocumentReady] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const addDebugLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setDebugLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setUploading(true);
    setUploadProgress(0);
    addDebugLog(`Starting upload: ${selectedFile.name}`);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
              onUploadProgress: (progressEvent: { loaded: number; total?: number }) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
            addDebugLog(`Upload progress: ${progress}%`);
          }
        },
      });

      addDebugLog('Upload successful');
      setPlaceholders(response.data.placeholders);
      setSessionId(response.data.sessionId);
      setMessages([{
        id: '1',
        text: response.data.response,
        isUser: false,
        suggestions: []
      }]);
    } catch (error) {
      addDebugLog(`Upload error: ${error}`);
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
      setUploadProgress(100);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputMessage,
      isUser: true,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);
    addDebugLog(`Sending message: ${inputMessage}`);

    try {
      const response = await axios.post('/api/chat', {
        message: inputMessage,
        sessionId,
      });

      const botMessage: Message = {
        id: (Date.now() + 1).toString(),
        text: response.data.response,
        isUser: false,
        suggestions: [],
      };

      setMessages(prev => [...prev, botMessage]);
      setPlaceholders(response.data.placeholders);
      addDebugLog(`Bot response: ${response.data.response}`);

      if (response.data.allFilled || response.data.shouldShowGenerateButton) {
        setDocumentReady(true);
        addDebugLog('Ready to generate document!');
      }
    } catch (error) {
      addDebugLog(`Chat error: ${error}`);
      console.error('Chat error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateDocument = async () => {
    if (!sessionId) return;

    setIsLoading(true);
    addDebugLog('Generating document...');

    try {
      const response = await axios.post('/api/generate-document', {
        sessionId,
      }, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(new Blob([response.data]));
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `completed-document-${Date.now()}.docx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      window.URL.revokeObjectURL(url);
      
      setDocumentReady(true);
      addDebugLog('Document generated and downloaded successfully');
      
    } catch (error) {
      addDebugLog(`Document generation error: ${error}`);
      console.error('Document generation error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setIsAnimating(true);
    setTimeout(() => {
      setFile(null);
      setUploading(false);
      setUploadProgress(0);
      setPlaceholders([]);
      setMessages([]);
      setInputMessage('');
      setIsLoading(false);
      setSessionId(null);
      setDocumentReady(false);
      setDownloadUrl(null);
      setDebugLogs([]);
      setIsAnimating(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }, 500);
  };

  const filledCount = placeholders.filter(p => p.filled).length;
  const totalCount = placeholders.length;

  return (
    <div className={`app ${isAnimating ? 'animate-fade-in' : ''}`}>
      <div className="animated-bg">
        <div className="floating-orb orb-1"></div>
        <div className="floating-orb orb-2"></div>
        <div className="floating-orb orb-3"></div>
      </div>

      <header className="header">
        <div className="header-content">
          <h1 className="header-title">
            Legal Document Processor
          </h1>
          <p className="header-subtitle">
            Upload templates, fill placeholders through Intelligent conversation
          </p>
          <div className="header-badge">
            <div className="badge-icon">
              <Zap />
            </div>
            <span>Powered by AI • Perfect Formatting</span>
          </div>
        </div>
      </header>

      <main className="main-container">
        {placeholders.length > 0 && (
          <div className="progress-section">
            <div className="progress-header">
              <div className="progress-info">
                <span className="progress-label">Document Completion</span>
                <span className="progress-stats">{filledCount}/{totalCount} fields completed</span>
              </div>
              <span className="progress-percentage">{Math.round((filledCount / totalCount) * 100)}%</span>
            </div>
            <div className="progress-bar-container">
              <div className="progress-bar">
                <div 
                  className="progress-fill" 
                  style={{ width: `${(filledCount / totalCount) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        )}

        {!file && (
          <div className="upload-container">
            <div className="card">
            <div className="upload-area" onClick={() => fileInputRef.current?.click()}>
              <div className="upload-main">
                <div className="upload-icon">
                  <div className="upload-icon-main">
                    <Upload />
                  </div>
                </div>
                <h2 className="upload-title">Upload Legal Document</h2>
                <p className="upload-description">
                  Drag and drop your .docx file here, or click to browse
                </p>
                <div className="upload-info">
                  <div className="upload-info-header">
                    <FileText />
                    <span>Supported Format</span>
                  </div>
                  <div className="upload-info-code">.docx files only</div>
                  <div className="upload-info-note">
                    Your document should contain placeholders in {`{curly}`} or [bracket] format
                  </div>
                </div>
              </div>
            </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".docx"
                onChange={handleFileUpload}
                style={{ display: 'none' }}
              />
            </div>
          </div>
        )}

        {file && (
          <>
            {uploading && (
              <div className="card">
                <div className="progress-card">
                  <div className="progress-icon">
                    <div className="progress-icon-glow"></div>
                    <div className="progress-icon-main">
                      <Play />
                    </div>
                  </div>
                  <span className="progress-text">Uploading...</span>
                  <span className="progress-percentage">{uploadProgress}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${uploadProgress}%` }}></div>
                </div>
              </div>
            )}

            {placeholders.length > 0 && (
              <div className="card">
                <div className="progress-card">
                  <span className="progress-text">Document Processing Progress</span>
                  <span className="progress-percentage">{Math.round((filledCount / totalCount) * 100)}%</span>
                </div>
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${(filledCount / totalCount) * 100}%` }}></div>
                </div>
                <h3 className="placeholders-title">
                  Placeholders Status ({filledCount}/{totalCount} Complete)
                </h3>
                <div className="placeholders-grid">
                  {placeholders.map((placeholder, index) => (
                    <div key={index} className={`placeholder-item ${placeholder.filled ? 'filled' : 'unfilled'}`}>
                      <div className="placeholder-content">
                        <span className="placeholder-text">
                          {placeholder.name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {messages.length > 0 && (
      <div className="card">
                <div className="chat-header">
                  <h3 className="chat-title">AI Assistant</h3>
                  <div className="chat-status">
                    <div className="chat-status-dot"></div>
                    <span className="chat-status-text">Online</span>
                  </div>
                </div>

                <div className="chat-messages">
                  {messages.map((message) => (
                    <div key={message.id} className={`chat-message ${message.isUser ? 'user' : 'bot'}`}>
                      <div className="message-bubble">
                        {message.text}
                      </div>
                    </div>
                  ))}
                  {isLoading && (
                    <div className="chat-message bot">
                      <div className="message-bubble">
                        <div className="chat-loading">
                          <Sparkles />
                        </div>
                        Thinking...
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="chat-input-container">
                  <div className="chat-input-wrapper">
                    <input
                      type="text"
                      className="chat-input"
                      placeholder="Ask me about any placeholder..."
                      value={inputMessage}
                      onChange={(e) => setInputMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
                      disabled={isLoading}
                    />
                    {isLoading && (
                      <div className="chat-loading">
                        <Sparkles />
                      </div>
                    )}
                  </div>
                  <button
                    className="send-button"
                    onClick={handleSendMessage}
                    disabled={isLoading || !inputMessage.trim()}
                  >
                    <ArrowRight />
                    Send
        </button>
                </div>
              </div>
            )}

            {documentReady && downloadUrl && (
              <div className="card download-card">
                <div className="download-icon">
                  <div className="download-icon-glow"></div>
                  <div className="download-icon-main">
                    <ArrowRight />
                  </div>
                </div>
                <h3 className="download-title">Document Ready!</h3>
                <p className="download-description">
                  Your legal document has been generated with all placeholders filled.
                </p>
                <a href={downloadUrl} download="generated-document.docx" className="download-button">
                  <ArrowRight />
                  Download Document
                </a>
              </div>
            )}

            <div className="action-buttons">
              <button className="action-button primary" onClick={() => setShowDebug(!showDebug)}>
                <Star />
                {showDebug ? 'Hide' : 'Show'} Debug
              </button>
              {placeholders.length > 0 && (
                <button className="action-button generate" onClick={handleGenerateDocument} disabled={isLoading}>
                  <Play />
                  {isLoading ? 'Generating...' : 'Generate Document'}
                </button>
              )}
              <button className="action-button secondary" onClick={handleReset}>
                <Sparkles />
                Reset
              </button>
            </div>

            {showDebug && (
              <div className="debug-panel">
                <div className="debug-header">
                  <div className="debug-icon">
                    <div className="debug-icon-glow"></div>
                    <div className="debug-icon-main">
                      <Star />
                    </div>
                  </div>
                  <h3 className="debug-title">Debug Console</h3>
                </div>
                <div className="debug-logs">
                  {debugLogs.map((log, index) => (
                    <div key={index} className="debug-log">{log}</div>
                  ))}
                </div>
      </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default App;