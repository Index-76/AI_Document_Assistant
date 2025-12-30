/**
 * 后端服务入口 - 主服务器文件
 * 
 * 根据架构规范，此文件仅负责：
 * - Express服务器初始化
 * - 中间件配置
 * - API端点路由定义
 * - 静态文件服务配置
 * 
 * 业务服务逻辑必须封装在services目录下的独立文件中
 */

require('dotenv').config(); // 确保环境变量被加载
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const loggerService = require('./services/loggerService');
const configService = require('./services/configService');
const documentService = require('./services/documentService');
const aiService = require('./services/aiService');
const fileManagerService = require('./services/fileManagerService');
const { ToolDecisionService } = require('./services/toolDecisionService');
const DirectoryViewer = require('./tools/DirectoryViewer');
const DocumentTableFiller = require('./tools/DocumentTableFiller');

const app = express();
const PORT = configService.get('port') || 2070; // 默认端口
// 使用硬编码的API基础路径
const API_BASE_URL = '/api';

// 使用日志中间件
app.use(loggerService.logRequest);

// 配置CORS，允许来自任何源的请求
app.use(cors({
  origin: '*', // 允许所有源 - 在生产环境中应更具体
  credentials: true
}));

// Middleware
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

// 获取multer上传中间件
const upload = documentService.getUploadMiddleware();

// 定义前端构建目录路径
const frontendBuildPath = path.join(__dirname, '../frontend/build'); // 默认路径

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

// Upload document endpoint
app.post(`${API_BASE_URL}/upload`, async (req, res) => {
  try {
    // 检查是否有文件被上传
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 检查文件大小是否超过限制
    const maxFileSize = 10 * 1024 * 1024; // 10MB 默认限制
    if (!fileManagerService.isFileSizeValid(req.file.size, maxFileSize)) {
      documentService.cleanupFile(req.file.path); // 清理过大的文件
      return res.status(400).json({ error: "File size exceeds limit" });
    }

    // 获取目标区域，默认为 'uploads'
    const section = req.body.section || 'uploads'; // 默认上传到uploads目录

    // 使用fileManagerService获取目标目录
    let targetDirectory = await fileManagerService.getSectionDirectory(section);

    // 处理文件名编码问题 - 改进中文文件名处理
    let processedFileName = req.file.originalname;
    try {
      // 尝试修复可能的编码问题
      processedFileName = Buffer.from(req.file.originalname, 'binary').toString('utf8');
      
      // 检查是否包含乱码字符，包括Unicode替换字符(\uFFFD)和一些常见的乱码特征
      if (processedFileName.includes('\uFFFD') || /[\uFFFD]/.test(processedFileName)) {
        try {
          // 尝试使用GBK解码
          processedFileName = Buffer.from(req.file.originalname, 'binary').toString('gbk');
        } catch (e) {
          console.warn('GBK decoding failed, falling back to original filename');
        }
      }
      
      // 如果还是有问题，尝试其他方法
      if (processedFileName.includes('\uFFFD') || /[\uFFFD]/.test(processedFileName)) {
        try {
          // 尝试使用系统默认编码
          const os = require('os');
          const isWindows = os.platform() === 'win32';
          if (isWindows) {
            // 在Windows上尝试使用latin1编码
            processedFileName = Buffer.from(req.file.originalname, 'binary').toString('latin1');
          }
        } catch (e) {
          console.warn('Alternative decoding failed, using original filename');
        }
      }
      
      // 最后如果仍然包含乱码字符，使用原始文件名
      if (processedFileName.includes('\uFFFD') || /[\uFFFD]/.test(processedFileName)) {
        processedFileName = req.file.originalname;
      }
    } catch (e) {
      // 如果所有解码尝试都失败，使用原始文件名
      processedFileName = req.file.originalname;
      console.error('Error processing filename encoding:', e);
    }

    // 移动文件到目标区域
    const targetPath = path.join(targetDirectory, processedFileName);
    
    // 检查文件是否已存在
    if (fs.existsSync(targetPath)) {
      // 如果文件已存在，创建新名称
      const ext = path.extname(processedFileName);
      const baseName = path.basename(processedFileName, ext);
      let counter = 1;
      let newTargetPath;
      
      do {
        const newFileName = `${baseName}(${counter})${ext}`;
        newTargetPath = path.join(targetDirectory, newFileName);
        counter++;
      } while (fs.existsSync(newTargetPath));
      
      // 移动文件到新路径
      fs.renameSync(req.file.path, newTargetPath);
    } else {
      // 直接移动文件
      fs.renameSync(req.file.path, targetPath);
    }

    // 解析文档内容 - 现在返回JSON格式的数据
    const result = await documentService.parseDocument(targetPath, req.file.mimetype);

    if (!result.success) {
      return res.status(500).json({ error: result.error || "Error processing document" });
    }

    res.json({
      success: true,
      filename: processedFileName,
      jsonData: result.jsonData, // 返回结构化的JSON数据
      metadata: result.metadata
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ error: "Error processing file" });
  }
});

// Ask question to document
app.post(`${API_BASE_URL}/ask`, async (req, res) => {
  try {
    const { question, documentText } = req.body;
    
    console.log('Received /api/ask request');
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Question provided:', !!question);
    console.log('Document text provided:', !!documentText);
    console.log('Question type:', typeof question);
    console.log('Document text type:', typeof documentText);
    console.log('Question length:', question ? question.length : 'N/A');
    console.log('Document text length:', documentText ? documentText.length : 'N/A');

    if (!question || !documentText) {
      console.log('Parameter validation failed - sending 400 error');
      return res
        .status(400)
        .json({ error: "Question and document text are required", 
                details: { 
                  hasQuestion: !!question, 
                  hasDocumentText: !!documentText,
                  questionType: typeof question,
                  documentTextType: typeof documentText
                } 
        });
    }

    console.log('Question:', question.substring(0, 100) + '...'); // 仅记录前100个字符
    console.log('Document text length:', documentText.length);

    // 使用AI服务来处理问题
    const answer = await aiService.askQuestion(question, documentText);

    res.json({
      answer: answer,
    });
  } catch (error) {
    console.error("Ask error:", error);
    res.status(500).json({ error: "Error processing question" });
  }
});

// Chat with AI directly (without document context)
app.post(`${API_BASE_URL}/chat`, async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ error: "Message is required" });
    }

    // 使用AI服务来处理直接对话
    const response = await aiService.sendMessage(message, history || []);

    res.json({
      response: response,
    });
  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Error processing chat message" });
  }
});

// Enhanced chat with tool decision (先调用决策AI判断是否使用工具，若需要则执行工具后将结果传递给对话AI)
app.post(`${API_BASE_URL}/chat-with-tool-decision`, async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message) {
      return res
        .status(400)
        .json({ error: "Message is required" });
    }

    // 步骤1: 使用决策AI判断是否需要调用工具
    const toolInfo = await ToolDecisionService.shouldCallTool(message);
    
    let aiResponse;
    
    if (toolInfo.specificTool === 'none') {
      // 步骤2a: 如果不需要工具，直接将消息发送给对话AI
      aiResponse = await aiService.sendMessage(message, history || []);
    } else {
      // 步骤2b: 如果需要工具，执行工具
      loggerService.i(`执行工具: ${toolInfo.specificToolName}`);
      const toolResult = await ToolDecisionService.executeTool(toolInfo, message);
      
      if (toolResult) {
        // 将工具执行结果作为上下文传递给AI，让AI基于工具结果回答用户问题
        const enhancedMessage = `用户原始请求: ${message}\n\n工具执行结果: ${toolResult}`;
        aiResponse = await aiService.sendMessage(enhancedMessage, history || []);
      } else {
        // 如果工具执行失败，仍然将原始消息发送给AI
        aiResponse = await aiService.sendMessage(message, history || []);
      }
    }

    res.json({
      response: aiResponse,
      toolUsed: toolInfo.specificTool !== 'none',
      toolInfo: toolInfo.specificTool !== 'none' ? toolInfo : null,
    });
  } catch (error) {
    console.error("Chat with tool decision error:", error);
    res.status(500).json({ error: "Error processing chat message with tool decision" });
  }
});

// Summarize document endpoint
app.post(`${API_BASE_URL}/summarize`, async (req, res) => {
  try {
    const { documentText, maxSentences } = req.body;

    if (!documentText) {
      return res
        .status(400)
        .json({ error: "Document text is required" });
    }

    // 使用AI服务来总结文档
    const summary = await aiService.summarizeDocument(documentText, maxSentences || 5);

    res.json({
      summary: summary,
    });
  } catch (error) {
    console.error("Summarize error:", error);
    res.status(500).json({ error: "Error processing document" });
  }
});

// Directory viewer endpoint
app.get(`${API_BASE_URL}/directory-view`, async (req, res) => {
  try {
    const { section } = req.query;
    
    if (!section) {
      console.error("Directory viewer: Section parameter is missing");
      return res.status(400).json({ error: "Section parameter is required" });
    }

    let directoryPath;
    switch(section.toLowerCase()) {
      case 'waiting':
      case '等待':
        directoryPath = './data/等待/';
        break;
      case 'read':
      case '读取':
        directoryPath = './data/读取/';
        break;
      case 'template':
      case '模板':
        directoryPath = './data/模板/';
        break;
      case 'result':
      case '结果':
        directoryPath = './data/结果/';
        break;
      default:
        console.error(`Directory viewer: Invalid section parameter: ${section}`);
        return res.status(400).json({ error: "Invalid section" });
    }

    console.log(`Directory viewer: Attempting to read directory: ${directoryPath}`);
    
    // 检查目录是否存在
    if (!fs.existsSync(directoryPath)) {
      console.warn(`Directory viewer: Directory does not exist, creating: ${directoryPath}`);
      await fs.promises.mkdir(directoryPath, { recursive: true });
    }
    
    // 使用fileManagerService直接获取目录内容
    try {
      const dirExists = await fileManagerService.pathExists(directoryPath);
      if (!dirExists) {
        return res.json({ section: section, files: [] });
      }

      const entities = await fileManagerService.getFilesInDirectory(directoryPath);
      if (entities.length === 0) {
        const files = [];
        console.log(`Directory viewer: Successfully retrieved ${files.length} files from ${directoryPath}`);
        return res.json({
          section: section,
          files: files
        });
      }
      
      const files = entities.map(entity => {
        const filename = path.basename(entity.path);
        const isDirectory = entity.isDirectory;
        
        // 处理文件名编码问题
        let processedFileName = filename;
        try {
          // 尝试修复可能的编码问题
          processedFileName = Buffer.from(filename, 'binary').toString('utf8');
          // 如果包含乱码字符，尝试使用系统默认编码
          if (processedFileName.includes('') || /[]/.test(processedFileName)) {
            processedFileName = Buffer.from(filename, 'binary').toString('gbk');
          }
        } catch (e) {
          // 如果UTF-8解码失败，尝试GBK编码
          try {
            processedFileName = Buffer.from(filename, 'binary').toString('gbk');
          } catch (e2) {
            // 如果都失败了，使用原始文件名
            processedFileName = filename;
          }
        }
        
        // 返回与前端FileInfo模型兼容的对象
        return {
          name: processedFileName, // 使用处理后的文件名
          path: entity.path,
          isDirectory: isDirectory,
          size: entity.size || 0,
          modified: entity.mtime || new Date().toISOString(),
          updatedAt: entity.mtime || new Date().toISOString(),
          createdAt: entity.birthtime || new Date().toISOString()
        };
      });
      
      console.log(`Directory viewer: Successfully retrieved ${files.length} files from ${directoryPath}`);
    
      res.json({
        section: section,
        files: files
      });
    } catch (e) {
      console.error("Directory viewer error:", e);
      res.status(500).json({ 
        error: "Error reading directory", 
        details: `读取目录失败: ${e.message}` 
      });
    }
  } catch (error) {
    console.error("Directory viewer error:", error);
    res.status(500).json({ 
      error: "Error reading directory", 
      details: error.message 
    });
  }
});

// Delete file endpoint
app.delete(`${API_BASE_URL}/file`, async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: "File path is required" });
    }

    // 使用fileManagerService删除文件
    const success = await fileManagerService.deleteFile(filePath);

    if (success) {
      res.json({
        success: true,
        message: "File deleted successfully"
      });
    } else {
      res.status(500).json({ error: "Failed to delete file" });
    }
  } catch (error) {
    console.error("Delete file error:", error);
    res.status(500).json({ error: "Error deleting file" });
  }
});

// Move file endpoint
app.put(`${API_BASE_URL}/file/move`, async (req, res) => {
  try {
    const { sourcePath, targetSection, currentPath } = req.body;

    if (!sourcePath || !targetSection) {
      return res.status(400).json({ error: "Source path and target section are required" });
    }

    // 确定目标目录
    let targetDirectory;
    switch(targetSection.toLowerCase()) {
      case 'waiting':
      case '等待':
        targetDirectory = './data/等待/';
        break;
      case 'read':
      case '读取':
        targetDirectory = './data/读取/';
        break;
      case 'template':
      case '模板':
        targetDirectory = './data/模板/';
        break;
      case 'result':
      case '结果':
        targetDirectory = './data/结果/';
        break;
      default:
        return res.status(400).json({ error: "Invalid target section" });
    }

    // 使用fs.rename移动文件
    const fileName = path.basename(sourcePath);
    const targetPath = path.join(targetDirectory, fileName);
    
    // 确保目标目录存在
    await fileManagerService.ensureDirectoryExists(targetDirectory);
    
    // 移动文件
    fs.renameSync(sourcePath, targetPath);

    res.json({
      success: true,
      message: "File moved successfully",
      newPath: targetPath
    });
  } catch (error) {
    console.error("Move file error:", error);
    res.status(500).json({ error: "Error moving file" });
  }
});

// Table fill endpoint
app.post(`${API_BASE_URL}/tableFill`, async (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({ error: "Input is required" });
    }

    // 使用DocumentTableFiller来处理表格填充
    const result = await DocumentTableFiller.process(input);

    res.json({
      result: result
    });
  } catch (error) {
    console.error("Table fill error:", error);
    res.status(500).json({ error: "Error filling table" });
  }
});

// Auto storage endpoint
app.post(`${API_BASE_URL}/autoStorage`, async (req, res) => {
  try {
    const { input } = req.body;

    if (!input) {
      return res.status(400).json({ error: "Input is required" });
    }

    // 检查数据库配置是否完整
    const dbConfigured = configService.get('databaseUrl') && 
                        configService.get('databaseUsername') && 
                        configService.get('databasePassword');
    if (!dbConfigured) {
      return res.status(400).json({ error: "Database not configured" });
    }

    // 这里实现自动入库逻辑
    // 暂时返回成功信息
    res.json({
      result: "Data stored successfully"
    });
  } catch (error) {
    console.error("Auto storage error:", error);
    res.status(500).json({ error: "Error storing data" });
  }
});

// Document query endpoint
app.post(`${API_BASE_URL}/query`, async (req, res) => {
  try {
    const { query } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query is required" });
    }

    // 这里实现文档查询逻辑
    // 暂时返回成功信息
    res.json({
      result: "Query processed successfully"
    });
  } catch (error) {
    console.error("Document query error:", error);
    res.status(500).json({ error: "Error processing query" });
  }
});

// Get configuration endpoint
app.get(`${API_BASE_URL}/config`, async (req, res) => {
  try {
    // 返回后端配置信息
    const aiConfig = {
      siliconFlowApiKey: configService.get('siliconFlowApiKey') ? '***MASKED***' : '',
      siliconFlowBaseUrl: configService.get('siliconFlowBaseUrl'),
      chatModelName: configService.get('chatModelName'),
      decisionModelName: configService.get('decisionModelName'),
      analysisModelName: configService.get('analysisModelName')
    };
    
    const databaseConfig = {
      databaseUrl: configService.get('databaseUrl') ? '***MASKED***' : '',
      databaseUsername: configService.get('databaseUsername') ? '***MASKED***' : '',
      databaseType: configService.get('databaseType'),
      databaseName: configService.get('databaseName')
    };
    
    // 检查数据库配置是否完整
    const dbConfigured = configService.get('databaseUrl') && 
                        configService.get('databaseUsername') && 
                        configService.get('databasePassword');
    
    res.json({
      port: configService.get('port') || 2070,
      frontendBuildPath: path.join(__dirname, '../frontend/build'),
      supportedFileTypes: [
        'application/pdf', 
        'application/msword', 
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ],
      maxFileSize: 10 * 1024 * 1024, // 10MB
      databaseConfigured: dbConfigured,
      // 添加AI和数据库配置
      ...aiConfig,
      ...databaseConfig
    });
  } catch (error) {
    console.error("Config get error:", error);
    res.status(500).json({ error: "Error getting configuration" });
  }
});

// Update configuration endpoint
app.post(`${API_BASE_URL}/config`, async (req, res) => {
  try {
    const configUpdates = req.body;
    
    // 更新配置
    await configService.updateConfig(configUpdates);
    
    res.json({
      success: true,
      message: "Configuration updated successfully"
    });
  } catch (error) {
    console.error("Config update error:", error);
    res.status(500).json({ error: "Error updating configuration" });
  }
});

// Serve document content endpoint - GET version
app.get(`${API_BASE_URL}/document-content`, async (req, res) => {
  try {
    const { filePath } = req.query;

    if (!filePath) {
      return res.status(400).json({ error: "File path is required" });
    }

    // 确保路径在安全范围内 - 仅允许访问data目录下的文件
    const safePath = path.resolve(filePath);
    const dataDir = path.resolve('./data');
    
    if (!safePath.startsWith(dataDir)) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const fileContent = fs.readFileSync(safePath, 'utf8');
    res.json({
      content: fileContent
    });
  } catch (error) {
    console.error("Serve document content error:", error);
    res.status(500).json({ error: "Error reading file" });
  }
});

// Serve document content endpoint - POST version
app.post(`${API_BASE_URL}/document-content`, async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: "File path is required" });
    }

    // 确保路径在安全范围内 - 仅允许访问data目录下的文件
    const safePath = path.resolve(filePath);
    const dataDir = path.resolve('./data');
    
    if (!safePath.startsWith(dataDir)) {
      return res.status(400).json({ error: "Invalid file path" });
    }

    if (!fs.existsSync(safePath)) {
      return res.status(404).json({ error: "File not found" });
    }

    const fileContent = fs.readFileSync(safePath, 'utf8');
    res.json({
      content: fileContent
    });
  } catch (error) {
    console.error("Serve document content error:", error);
    res.status(500).json({ error: "Error reading file" });
  }
});

// Upload file to specific section endpoint
app.post(`${API_BASE_URL}/upload-to-section`, upload, async (req, res) => {
  try {
    // 检查是否有文件被上传
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    // 检查文件大小是否超过限制
    const maxFileSize = 10 * 1024 * 1024; // 10MB 默认限制
    if (!fileManagerService.isFileSizeValid(req.file.size, maxFileSize)) {
      documentService.cleanupFile(req.file.path); // 清理过大的文件
      return res.status(400).json({ error: "File size exceeds limit" });
    }

    // 获取目标区域，默认为 '等待'
    const section = req.body.section || '等待'; // 默认上传到等待目录

    // 使用fileManagerService获取目标目录
    let targetDirectory = await fileManagerService.getSectionDirectory(section);

    // 处理文件名编码问题 - 改进中文文件名处理
    let processedFileName = req.file.originalname;
    try {
      // 尝试修复可能的编码问题
      processedFileName = Buffer.from(req.file.originalname, 'binary').toString('utf8');
      
      // 检查是否包含乱码字符，包括Unicode替换字符(\uFFFD)和一些常见的乱码特征
      if (processedFileName.includes('\uFFFD') || /[\uFFFD]/.test(processedFileName)) {
        try {
          // 尝试使用GBK解码
          processedFileName = Buffer.from(req.file.originalname, 'binary').toString('gbk');
        } catch (e) {
          console.warn('GBK decoding failed, falling back to original filename');
        }
      }
      
      // 如果还是有问题，尝试其他方法
      if (processedFileName.includes('\uFFFD') || /[\uFFFD]/.test(processedFileName)) {
        try {
          // 尝试使用系统默认编码
          const os = require('os');
          const isWindows = os.platform() === 'win32';
          if (isWindows) {
            // 在Windows上尝试使用latin1编码
            processedFileName = Buffer.from(req.file.originalname, 'binary').toString('latin1');
          }
        } catch (e) {
          console.warn('Alternative decoding failed, using original filename');
        }
      }
      
      // 最后如果仍然包含乱码字符，使用原始文件名
      if (processedFileName.includes('\uFFFD') || /[\uFFFD]/.test(processedFileName)) {
        processedFileName = req.file.originalname;
      }
    } catch (e) {
      // 如果所有解码尝试都失败，使用原始文件名
      processedFileName = req.file.originalname;
      console.error('Error processing filename encoding:', e);
    }

    // 移动文件到目标区域
    const targetPath = path.join(targetDirectory, processedFileName);
    
    // 检查文件是否已存在
    if (fs.existsSync(targetPath)) {
      // 如果文件已存在，创建新名称
      const ext = path.extname(processedFileName);
      const baseName = path.basename(processedFileName, ext);
      let counter = 1;
      let newTargetPath;
      
      do {
        const newFileName = `${baseName}(${counter})${ext}`;
        newTargetPath = path.join(targetDirectory, newFileName);
        counter++;
      } while (fs.existsSync(newTargetPath));
      
      // 移动文件到新路径
      fs.renameSync(req.file.path, newTargetPath);
    } else {
      // 直接移动文件
      fs.renameSync(req.file.path, targetPath);
    }

    res.json({
      success: true,
      message: "File uploaded successfully",
      filePath: targetPath
    });
  } catch (error) {
    console.error("Upload to section error:", error);
    res.status(500).json({ error: "Error processing file upload" });
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

// Start the server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`API base URL: ${API_BASE_URL}`);
  console.log(`Frontend path: ${frontendBuildPath}`);
});

module.exports = app;