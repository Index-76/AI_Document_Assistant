const express = require("express");
const cors = require("cors");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { Configuration, OpenAIApi } = require("openai");
const path = require("path");
const fs = require("fs");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 2070; // 修改默认端口为2070

// Middleware
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// Serve static files from the 'frontend/build/web' directory
app.use(express.static(path.join(__dirname, "../frontend/build/web")));

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

// Routes
// 为所有非API路由提供前端index.html，以支持SPA路由
app.get(/\/(?!api)/, (req, res) => {
  const indexPath = path.join(__dirname, "../frontend/build/web/index.html");
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.send("AI Document Assistant API");
  }
});

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

// Start server
const server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API and Web App available on http://localhost:${PORT}`);
});

module.exports = app;
