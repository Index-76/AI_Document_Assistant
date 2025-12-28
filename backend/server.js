const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { Configuration, OpenAIApi } = require("openai");
const path = require("path");
const fs = require("fs");
const os = require("os");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 2070; // 修改默认端口为2070

// 配置CORS，允许来自任何源的请求
app.use(cors({
  origin: '*', // 允许所有源 - 在生产环境中应更具体
  credentials: true
}));

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 定义前端构建目录路径
const frontendBuildPath = path.join(__dirname, "../frontend/build/web");

// Log the path for debugging
console.log("Serving static files from:", frontendBuildPath);
console.log("Index file exists:", fs.existsSync(path.join(frontendBuildPath, 'index.html')));

// 静态文件服务，添加适当的头部信息
app.use(express.static(frontendBuildPath, {
  setHeaders: (res, filePath) => {
    // 为字体文件设置适当的CORS头部
    if (path.extname(filePath) === '.json' || 
        path.extname(filePath) === '.woff' || 
        path.extname(filePath) === '.woff2' || 
        path.extname(filePath) === '.ttf' || 
        path.extname(filePath) === '.otf') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
  }
}));

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 确保上传目录存在
    const uploadDir = "uploads/";
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});
const upload = multer({ storage: storage });

// OpenAI setup
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Handle API routes
// Upload document endpoint
app.post("/api/upload", upload.single("document"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // Process document based on type
    let textContent = "";
    if (req.file.mimetype === "application/pdf") {
      const dataBuffer = fs.readFileSync(req.file.path);
      const data = await pdfParse(dataBuffer);
      textContent = data.text;
    } else {
      // Handle text files
      textContent = fs.readFileSync(req.file.path, "utf8");
    }

    res.json({
      success: true,
      filename: req.file.filename,
      text: textContent.substring(0, 1000) + "...", // Send preview of text
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Error processing file" });
  }
});

// Ask question to document
app.post("/api/ask", async (req, res) => {
  try {
    const { question, documentText } = req.body;

    if (!question || !documentText) {
      return res
        .status(400)
        .json({ error: "Question and document text are required" });
    }

    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: `Based on the following document text: "${documentText}". Answer the question: "${question}"`,
      temperature: 0.7,
      max_tokens: 500,
    });

    res.json({
      answer: response.data.choices[0].text.trim(),
    });
  } catch (error) {
    console.error("Ask error:", error);
    res.status(500).json({ error: "Error processing question" });
  }
});

// Special handler for index.html - serve the index file directly
app.get('/index.html', (req, res) => {
  const indexPath = path.join(frontendBuildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    console.log("Serving index.html directly");
    res.sendFile(indexPath);
  } else {
    console.log("index.html file does not exist at:", indexPath);
    res.status(404).send("Frontend build not found. Please run 'flutter build web'");
  }
});

// Catch-all handler for all non-API routes - serve the frontend
// This ensures that Flutter's routing works properly
app.get(/^(?!\/api)/, (req, res) => {
  const indexPath = path.join(frontendBuildPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    console.log("Serving index.html for route:", req.url);
    res.sendFile(indexPath);
  } else {
    console.log("index.html file does not exist at:", indexPath);
    res.status(404).send("Frontend build not found. Please run 'flutter build web'");
  }
});

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  const interfaces = os.networkInterfaces();
  let ipv4Address = '';
  
  // Find the first available IPv4 address
  Object.keys(interfaces).forEach(interfaceName => {
    if (interfaceName.startsWith('eth') || interfaceName.startsWith('wlan')) {
      interfaces[interfaceName].forEach(iface => {
        if (!iface.internal && iface.family === 'IPv4') {
          ipv4Address = iface.address;
        }
      });
    }
  });
  
  console.log(`Server running on port ${PORT}`);
  if (ipv4Address) {
    console.log(`API and Web App available on http://${ipv4Address}:${PORT}`);
  }
  console.log(`API and Web App also available on http://localhost:${PORT}`);
});

module.exports = app;