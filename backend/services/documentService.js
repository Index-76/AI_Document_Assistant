const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { DocumentConverter } = require('../tools/DocumentConverter');
const fileManagerService = require('./fileManagerService');

// 配置multer存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // 从请求中获取section参数，如果没有则默认为'等待'
    // 由于multer在文件上传时（即body解析前）执行，我们需要使用其他方式获取section
    // 因此，我们需要在路由处理程序中处理文件移动
    const uploadDir = path.join(process.cwd(), 'data', '等待');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // 处理文件名编码问题
    let processedFileName = Buffer.from(file.originalname, 'binary').toString('utf8');
    
    // 检查是否包含乱码字符，包括Unicode替换字符(\uFFFD)和一些常见的乱码特征
    if (processedFileName.includes('\uFFFD') || /[\uFFFD]/.test(processedFileName)) {
      try {
        // 尝试使用GBK解码
        processedFileName = Buffer.from(file.originalname, 'binary').toString('gbk');
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
          processedFileName = Buffer.from(file.originalname, 'binary').toString('latin1');
        }
      } catch (e) {
        console.warn('Alternative decoding failed, using original filename');
      }
    }
    
    // 最后如果仍然包含乱码字符，使用原始文件名
    if (processedFileName.includes('\uFFFD') || /[\uFFFD]/.test(processedFileName)) {
      processedFileName = file.originalname;
    }
    
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(processedFileName));
  }
});

const upload = multer({ storage: storage });

class DocumentService {
  constructor() {
    this.upload = upload;
  }

  // 解析文档内容 - 现在返回JSON格式的数据
  async parseDocument(filePath, mimeType) {
    try {
      // 读取文件内容
      const fileBuffer = fs.readFileSync(filePath);
      
      // 检测文件类型
      const fileType = DocumentConverter.detectFileType(filePath);
      
      if (!DocumentConverter.isFileTypeSupported(fileType)) {
        throw new Error(`Unsupported file type: ${fileType}`);
      }

      // 使用DocumentConverter进行预处理
      const result = await DocumentConverter.preprocessFile(fileBuffer, fileType, path.basename(filePath));
      
      if (!result.success) {
        throw new Error(result.error || 'Document preprocessing failed');
      }
      
      // 返回JSON格式的数据
      return {
        success: true,
        jsonData: result.jsonData,
        metadata: result.metadata,
        type: result.type
      };
    } catch (error) {
      console.error('Document parsing error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // 清理上传文件
  cleanupFile(filePath) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // 获取multer中间件
  getUploadMiddleware() {
    return this.upload.single('document'); // 假设前端使用 'document' 作为字段名
  }
  
  // 获取文档列表
  async getDocumentList(section = '等待') {
    try {
      // 使用fileManagerService获取section目录路径
      const sectionDir = await fileManagerService.getSectionDirectory(section);
      const files = await fileManagerService.getFilesInDirectory(sectionDir);
      return files.filter(file => !file.isDirectory); // 只返回文件，不返回目录
    } catch (error) {
      console.error('Error getting document list:', error);
      return [];
    }
  }
  
  // 保存文档
  async saveDocument(buffer, originalName, section = '等待') {
    try {
      const targetDir = await fileManagerService.getSectionDirectory(section);
      const resolvedName = await fileManagerService.resolveFileConflict(targetDir, originalName);
      const filePath = path.join(targetDir, resolvedName);
      
      await fs.promises.writeFile(filePath, buffer);
      
      return {
        filename: resolvedName,
        path: filePath,
        size: buffer.length
      };
    } catch (error) {
      console.error('Error saving document:', error);
      throw new Error(`Failed to save document: ${error.message}`);
    }
  }
}

module.exports = new DocumentService();