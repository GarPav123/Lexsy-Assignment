const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve static files with fallback
const buildPath = path.join(__dirname, 'client/build');
const clientPath = path.join(__dirname, 'client');

console.log('Checking build path:', buildPath);
console.log('Build exists:', fs.existsSync(buildPath));

if (fs.existsSync(buildPath)) {
  console.log('Serving from build directory');
  app.use(express.static(buildPath));
} else {
  console.log('Build directory not found, serving from client directory');
  app.use(express.static(clientPath));
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `${uuidv4()}-${file.originalname}`);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    try {
      const allowedMimeTypes = [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/octet-stream',
        'application/zip'
      ];
      
      const allowedExtensions = ['.docx'];
      const fileExtension = path.extname(file.originalname).toLowerCase();
      
      if (allowedMimeTypes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
        console.log(`File accepted: ${file.originalname} (MIME: ${file.mimetype})`);
        cb(null, true);
      } else {
        console.log(`File rejected: ${file.originalname} (MIME: ${file.mimetype})`);
        cb(new Error('Only .docx files are allowed'), false);
      }
    } catch (error) {
      console.error('File filter error:', error);
      cb(error, false);
    }
  }
});

const documentSessions = new Map();

function convertPlaceholderFormat(content) {
  try {
    const zip = new PizZip(content);
    const docXml = zip.file('word/document.xml').asText();
    const convertedXml = docXml.replace(/\$?\[([^\]]+)\]/g, '{$1}');
    zip.file('word/document.xml', convertedXml);
    return zip.generate({ type: 'nodebuffer' });
  } catch (error) {
    console.error('Error converting placeholder format:', error);
    return content;
  }
}

function extractPlaceholders(text) {
  if (!text || typeof text !== 'string') {
    console.log('Invalid text provided to extractPlaceholders');
    return [];
  }

  const docxtemplaterPattern = /\{([^}]+)\}/g;
  const legacyPattern = /\[([^\]]+)\]/g;
  const dollarPattern = /\$\[([^\]]+)\]/g;
  const placeholders = [];
  let match;
  
  while ((match = docxtemplaterPattern.exec(text)) !== null) {
    const placeholder = match[1].trim();
    if (placeholder && 
        !placeholder.includes('<') && 
        !placeholder.includes('>') && 
        !placeholder.includes('w:') &&
        placeholder.length > 0 &&
        !placeholders.find(p => p.name === placeholder)) {
      placeholders.push({
        name: placeholder,
        originalText: match[0],
        filled: false,
        value: ''
      });
    }
  }
  
  if (placeholders.length === 0) {
    while ((match = dollarPattern.exec(text)) !== null) {
      const placeholder = match[1].trim();
      if (placeholder && 
          !placeholder.includes('<') && 
          !placeholder.includes('>') && 
          !placeholder.includes('w:') &&
          placeholder.length > 0 &&
          !placeholders.find(p => p.name === placeholder)) {
        placeholders.push({
          name: placeholder,
          originalText: match[0],
          filled: false,
          value: ''
        });
      }
    }
  }
  
  if (placeholders.length === 0) {
    while ((match = legacyPattern.exec(text)) !== null) {
      const placeholder = match[1].trim();
      if (placeholder && 
          !placeholder.includes('<') && 
          !placeholder.includes('>') && 
          !placeholder.includes('w:') &&
          placeholder.length > 0 &&
          !placeholders.find(p => p.name === placeholder)) {
        placeholders.push({
          name: placeholder,
          originalText: match[0],
          filled: false,
          value: ''
        });
      }
    }
  }
  
  return placeholders;
}

function generateConversationalResponse(placeholders, filledCount) {
  const unfilled = placeholders.filter(p => !p.filled);
  
  if (unfilled.length === 0) {
    return {
      message: "Perfect! All placeholders have been filled. Click the buttons below to preview or download your document.",
      type: "completion",
      action: "document_ready"
    };
  }
  
  const nextPlaceholder = unfilled[0];
  const contextualQuestion = generateContextualQuestion(nextPlaceholder.name);
  const progress = Math.round((filledCount / placeholders.length) * 100);
  
  return {
    message: contextualQuestion,
    type: "question",
    placeholder: nextPlaceholder.name,
    suggestions: []
  };
}

function generateContextualQuestion(placeholderName) {
  const lowerName = placeholderName.toLowerCase();
  
  // Company-related questions
  if (lowerName.includes('company') && lowerName.includes('name')) {
    return "What is the name of your company? Please provide the full legal company name as it appears in your incorporation documents.";
  }
  
  if (lowerName.includes('company') && lowerName.includes('address')) {
    return "What is your company's registered business address? Include street address, city, state, and zip code.";
  }
  
  // Investor-related questions
  if (lowerName.includes('investor')) {
    return "What is the name of the investor? Please provide the full legal name of the individual or entity making the investment.";
  }
  
  // Date-related questions
  if (lowerName.includes('date')) {
    return "What is the date for this document? Please provide the date in MM/DD/YYYY format (e.g., 01/15/2024).";
  }
  
  // State/Jurisdiction questions
  if (lowerName.includes('state') || lowerName.includes('jurisdiction')) {
    return "What state or jurisdiction governs this agreement? Please provide the full state name (e.g., Delaware, California).";
  }
  
  // Incorporation questions
  if (lowerName.includes('incorporation')) {
    return "In which state is your company incorporated? Please provide the full state name where your company was legally incorporated.";
  }
  
  // Title/Position questions
  if (lowerName.includes('title') || lowerName.includes('position')) {
    return "What is the title or position of the person signing this document? (e.g., CEO, President, Managing Director)";
  }
  
  // Name questions
  if (lowerName.includes('name') && !lowerName.includes('company')) {
    return "What is the full name of the person? Please provide first name, middle name (if applicable), and last name.";
  }
  
  // Amount/Value questions
  if (lowerName.includes('amount') || lowerName.includes('value') || lowerName.includes('price')) {
    return "What is the monetary amount or value? Please provide the amount in numbers (e.g., 100000 for $100,000).";
  }
  
  // Default contextual question
  return `Please provide the value for "${placeholderName}". What information should be filled in for this field?`;
}

function generateDocumentWithDocxtemplater(originalContent, placeholders) {
  try {
    const zip = new PizZip(originalContent);
    
    const doc = new Docxtemplater(zip, {
      paragraphLoop: true,
      linebreaks: true,
    });
    
    const data = {};
    placeholders.forEach(placeholder => {
      data[placeholder.name] = placeholder.value;
    });
    
    doc.render(data);
    
    const buffer = doc.getZip().generate({ type: 'nodebuffer' });
    
    return buffer;
    
  } catch (error) {
    throw new Error(`Document generation failed: ${error.message}`);
  }
}

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    console.log('📤 Upload request received');
    
    if (!req.file) {
      console.log('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log(`📁 Processing file: ${req.file.originalname}`);

    const content = fs.readFileSync(req.file.path, 'binary');
    
    let zip, doc;
    try {
      zip = new PizZip(content);
      doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
      });
    } catch (zipError) {
      console.error('Invalid .docx file:', zipError.message);
      return res.status(400).json({ error: 'Invalid .docx file. Please ensure the file is a valid Word document.' });
    }
    
        // Use Docxtemplater's built-in method to get clean text
        const fullText = doc.getFullText();
        console.log(`Document text length: ${fullText.length} characters`);
        console.log(`Sample text: ${fullText.substring(0, 200)}...`);
        
        // Convert [placeholder] format to {placeholder} format for Docxtemplater
        const convertedContent = convertPlaceholderFormat(content);
        
        // Recreate the document with converted placeholders
        const convertedZip = new PizZip(convertedContent);
        const convertedDoc = new Docxtemplater(convertedZip, {
          paragraphLoop: true,
          linebreaks: true,
        });
        
        const convertedText = convertedDoc.getFullText();
        console.log(`Converted text length: ${convertedText.length} characters`);
        
        const placeholders = extractPlaceholders(convertedText);
    console.log(`Extracted ${placeholders.length} placeholders:`, placeholders.map(p => p.name));
    
    if (placeholders.length === 0) {
      console.log('No placeholders found in document');
      return res.status(400).json({ error: 'No placeholders found in document. Please ensure your document contains placeholders in {curly} or [bracket] format.' });
    }
    
    const sessionId = uuidv4();
    documentSessions.set(sessionId, {
      filePath: req.file.path,
      originalContent: convertedContent, // Use converted content
      placeholders: placeholders,
      filledPlaceholders: 0,
      createdAt: new Date()
    });
    
    console.log(`Session created: ${sessionId}`);
    
    const response = generateConversationalResponse(placeholders, 0);
    
    res.json({
      sessionId,
      placeholders: placeholders.map(p => ({ name: p.name, filled: p.filled })),
      response: response.message,
      suggestions: response.suggestions || [],
      totalPlaceholders: placeholders.length,
      shouldShowGenerateButton: false
    });
    
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: `Failed to process document: ${error.message}` });
  }
});

app.post('/api/chat', (req, res) => {
  try {
    const { sessionId, message } = req.body;
    
    if (!sessionId || !documentSessions.has(sessionId)) {
      return res.status(400).json({ error: 'Invalid session' });
    }
    
    const session = documentSessions.get(sessionId);
    const { placeholders } = session;
    
    // Check if user wants to generate document
    const lowerMessage = message.toLowerCase().trim();
    if (lowerMessage === 'yes' || lowerMessage === 'generate' || lowerMessage === 'generate document' || lowerMessage.includes('generate')) {
      return res.json({
        response: "Perfect! I'll generate your document now. Click the 'Generate Document' button below to download it.",
        allFilled: true,
        suggestions: ["Generate document"],
        shouldShowGenerateButton: true
      });
    }
    
    const unfilled = placeholders.filter(p => !p.filled);
    
    if (unfilled.length === 0) {
      return res.json({
        response: "All placeholders have been filled! Would you like me to generate the final document?",
        allFilled: true,
        suggestions: ["Yes", "Generate document", "Review placeholders"],
        shouldShowGenerateButton: true
      });
    }
    
    const currentPlaceholder = unfilled[0];
    
    currentPlaceholder.filled = true;
    currentPlaceholder.value = message;
    session.filledPlaceholders++;
    
    const response = generateConversationalResponse(placeholders, session.filledPlaceholders);
    
    res.json({
      response: response.message,
      placeholders: placeholders.map(p => ({ name: p.name, filled: p.filled })),
      suggestions: response.suggestions || [],
      allFilled: unfilled.length === 1,
      shouldShowGenerateButton: unfilled.length <= 1
    });
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to process chat message' });
  }
});

app.post('/api/generate-document', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (!sessionId || !documentSessions.has(sessionId)) {
      return res.status(400).json({ error: 'Invalid session' });
    }
    
    const session = documentSessions.get(sessionId);
    const { filePath, originalContent, placeholders } = session;
    
    const buffer = generateDocumentWithDocxtemplater(originalContent, placeholders);
    
    const filename = `completed-document-${Date.now()}.docx`;
    const filepath = path.join(__dirname, 'uploads', filename);
    fs.writeFileSync(filepath, buffer);
    
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
    
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate document' });
  }
});

app.get('*', (req, res) => {
  const indexPath = path.join(__dirname, 'client/build', 'index.html');
  
  console.log('Looking for index.html at:', indexPath);
  console.log('Index exists:', fs.existsSync(indexPath));
  
  if (fs.existsSync(indexPath)) {
    console.log('Serving built index.html');
    res.sendFile(indexPath);
  } else {
    console.log('Built index.html not found, creating fallback');
    const fallbackHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Legal Document Processor</title>
    <script type="module" crossorigin src="/main.js"></script>
    <link rel="stylesheet" crossorigin href="/main.css">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`;
    res.send(fallbackHtml);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});