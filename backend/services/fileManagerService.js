const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const loggerService = require('./loggerService');

class FileManagerService {
  constructor() {
    this.uploadDir = path.join(process.cwd(), 'data', '等待');
    this.tempDir = path.join(process.cwd(), 'temp');
    this.dataDir = path.join(process.cwd(), 'data');
    
    // 确保目录存在
    this.ensureDirectories();
  }

  // 确保必要目录存在
  async ensureDirectories() {
    const dirs = [this.uploadDir, this.tempDir, this.dataDir];
    for (const dir of dirs) {
      try {
        await fs.access(dir);
      } catch {
        await fs.mkdir(dir, { recursive: true });
      }
    }
  }

  // 生成唯一的文件名
  generateUniqueFilename(originalName) {
    const ext = path.extname(originalName);
    const name = path.basename(originalName, ext);
    const uniqueId = uuidv4().substring(0, 8);
    
    return `${name}_${uniqueId}_${Date.now()}${ext}`;
  }

  // 保存文件
  async saveFile(buffer, originalName, dir = this.uploadDir) {
    try {
      // 处理文件名编码问题
      let processedName = originalName;
      try {
        // 尝试修复可能的编码问题
        processedName = Buffer.from(originalName, 'binary').toString('utf8');
        // 如果包含乱码字符，尝试使用系统默认编码
        if (processedName.includes('') || /[]/.test(processedName)) {
          processedName = Buffer.from(originalName, 'binary').toString('gbk');
        }
      } catch (e) {
        // 如果UTF-8解码失败，尝试GBK编码
        try {
          processedName = Buffer.from(originalName, 'binary').toString('gbk');
        } catch (e2) {
          // 如果都失败了，使用原始文件名
          processedName = originalName;
        }
      }
      
      const filename = this.generateUniqueFilename(processedName);
      const filePath = path.join(dir, filename);
      
      await fs.writeFile(filePath, buffer);
      
      return {
        filename,
        path: filePath,
        size: buffer.length
      };
    } catch (error) {
      throw new Error(`Failed to save file: ${error.message}`);
    }
  }

  // 读取文件
  async readFile(filePath) {
    try {
      await fs.access(filePath);
      return await fs.readFile(filePath);
    } catch (error) {
      throw new Error(`Failed to read file: ${error.message}`);
    }
  }

  // 删除文件或目录
  async deleteFile(filePath) {
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        await fs.rm(filePath, { recursive: true, force: true });
      } else {
        await fs.unlink(filePath);
      }
      return true;
    } catch (error) {
      loggerService.error(`Failed to delete file: ${error.message}`);
      return false;
    }
  }

  // 获取文件信息
  async getFileInfo(filePath) {
    try {
      const stats = await fs.stat(filePath);
      
      return {
        name: path.basename(filePath),
        path: filePath,
        size: stats.size,
        createdAt: stats.birthtime,
        updatedAt: stats.mtime,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory()
      };
    } catch (error) {
      throw new Error(`Failed to get file info: ${error.message}`);
    }
  }

  // 检查文件大小是否有效
  isFileSizeValid(fileSize, maxSize) {
    return fileSize <= maxSize;
  }

  // 确保目录存在
  async ensureDirectoryExists(dirPath) {
    try {
      await fs.access(dirPath);
    } catch (error) {
      await fs.mkdir(dirPath, { recursive: true });
    }
  }

  // 清理临时文件
  async cleanupFile(filePath) {
    try {
      await fs.unlink(filePath);
      loggerService.info(`Cleaned up file: ${filePath}`);
    } catch (error) {
      loggerService.error(`Error cleaning up file ${filePath}:`, error);
    }
  }

  // 清理临时文件（超过指定时间的文件）
  async cleanupTempFiles(maxAgeMinutes = 60) {
    try {
      const files = await fs.readdir(this.tempDir);
      const now = Date.now();
      const cleanedFiles = [];
      
      for (const file of files) {
        const filePath = path.join(this.tempDir, file);
        const stats = await fs.stat(filePath);
        
        // 检查文件是否超过指定时间（以毫秒为单位）
        if (now - stats.mtime > maxAgeMinutes * 60 * 1000) {
          await fs.unlink(filePath);
          cleanedFiles.push(file);
        }
      }
      
      return cleanedFiles;
    } catch (error) {
      throw new Error(`Failed to cleanup temp files: ${error.message}`);
    }
  }

  // 检查文件类型是否支持
  isSupportedFileType(mimeType) {
    const supportedTypes = [
      'text/plain',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/csv'
    ];
    
    return supportedTypes.includes(mimeType);
  }

  // 检查文件大小是否在限制内
  isFileSizeValid(size, maxSize = 10 * 1024 * 1024) { // 默认10MB
    return size <= maxSize;
  }

  // 获取目录中的所有文件和子目录
  async getFilesInDirectory(dir = this.uploadDir) {
    try {
      const dirExists = await this.pathExists(dir);
      if (!dirExists) {
        return [];
      }
      
      const files = await fs.readdir(dir, { encoding: 'utf8' });
      const fileInfoPromises = files.map(async (file) => {
        const filePath = path.join(dir, file);
        const stats = await fs.stat(filePath);
        
        // 尝试修复中文文件名编码问题
        let fileName = file;
        try {
          // 首先尝试UTF-8解码
          fileName = Buffer.from(file, 'binary').toString('utf8');
          // 如果包含乱码字符，尝试使用系统默认编码
          if (fileName.includes('') || /[]/.test(fileName)) {
            fileName = Buffer.from(file, 'binary').toString('gbk');
          }
        } catch (e) {
          // 如果UTF-8解码失败，尝试GBK编码
          try {
            fileName = Buffer.from(file, 'binary').toString('gbk');
          } catch (e2) {
            // 如果都失败了，使用原始文件名
            fileName = file;
          }
        }
        
        return {
          name: fileName,
          path: filePath,
          isDirectory: stats.isDirectory(),
          size: stats.size,
          createdAt: stats.birthtime,
          updatedAt: stats.mtime
        };
      });
      
      const fileInfo = await Promise.all(fileInfoPromises);
      return fileInfo;
    } catch (error) {
      throw new Error(`Failed to get files in directory: ${error.message}`);
    }
  }

  // 检查路径是否存在
  async pathExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  // 解决文件名冲突
  async resolveFileConflict(dirPath, originalName) {
    let newName = originalName;
    let counter = 2;
    
    while (await this.pathExists(path.join(dirPath, newName))) {
      const lastDotIndex = originalName.lastIndexOf('.');
      if (lastDotIndex > 0) {
        const nameWithoutExtension = originalName.substring(0, lastDotIndex);
        const extension = originalName.substring(lastDotIndex);
        newName = `${nameWithoutExtension}(${counter})${extension}`;
      } else {
        newName = `${originalName}(${counter})`;
      }
      counter++;
    }
    
    return newName;
  }

  // 解决目录名冲突
  async resolveDirectoryConflict(dirPath, originalName) {
    let newName = originalName;
    let counter = 2;
    
    while (await this.pathExists(path.join(dirPath, newName))) {
      newName = `${originalName}(${counter})`;
      counter++;
    }
    
    return newName;
  }

  // 递归复制目录
  async copyDirectory(sourceDir, destDir) {
    try {
      // 创建目标目录
      await fs.mkdir(destDir, { recursive: true });
      
      // 读取源目录内容
      const items = await fs.readdir(sourceDir);
      
      // 遍历并复制每个项目
      for (const item of items) {
        const sourcePath = path.join(sourceDir, item);
        const destPath = path.join(destDir, item);
        
        const stats = await fs.stat(sourcePath);
        
        if (stats.isDirectory()) {
          // 如果是目录，递归复制
          await this.copyDirectory(sourcePath, destPath);
        } else {
          // 如果是文件，直接复制
          await fs.copyFile(sourcePath, destPath);
        }
      }
    } catch (error) {
      loggerService.error(`Failed to copy directory: ${error.message}`);
      throw error;
    }
  }

  // 移动文件到另一个目录
  async moveFileToSection(filePath, targetDir) {
    try {
      const fileName = path.basename(filePath);
      const targetPath = path.join(targetDir, fileName);
      
      // 检查目标位置是否已存在同名文件或目录
      if (await this.pathExists(targetPath)) {
        const stats = await fs.stat(filePath);
        
        if (stats.isDirectory()) {
          // 如果是移动目录且目标位置已存在同名目录，生成新的目录名
          const newName = await this.resolveDirectoryConflict(targetDir, fileName);
          if (newName) {
            const newTargetPath = path.join(targetDir, newName);
            await fs.rename(filePath, newTargetPath);
            return true;
          } else {
            return false; // 用户选择取消操作
          }
        } else {
          // 如果是移动文件且目标位置已存在同名文件，生成新的文件名
          const newName = await this.resolveFileConflict(targetDir, fileName);
          if (newName) {
            const newTargetPath = path.join(targetDir, newName);
            await fs.rename(filePath, newTargetPath);
            return true;
          } else {
            return false; // 用户选择取消操作
          }
        }
      } else {
        // 目标位置不存在同名文件或目录，直接移动
        await fs.rename(filePath, targetPath);
        return true;
      }
    } catch (error) {
      loggerService.error(`Failed to move file: ${error.message}`);
      return false;
    }
  }

  // 获取应用文档目录下的文件存储根目录
  async getRootDirectory() {
    // 直接使用data目录作为根目录
    return this.dataDir;
  }

  // 获取指定区域的目录
  async getSectionDirectory(sectionName, subPath = '') {
    const sectionMap = {
      '等待': '等待',
      '模板': '模板',
      '读取': '读取',
      '结果': '结果',
      'temp': 'temp',
      'upload': 'uploads',
      'data': 'data'
    };
    
    // 如果传入的是英文标识，则映射到中文目录名，否则使用传入的名称
    const dirName = sectionMap[sectionName] || sectionName;
    
    const rootDir = await this.getRootDirectory();
    const sectionDir = path.join(rootDir, dirName, subPath);
    await this.ensureDirectoryExists(sectionDir);
    return sectionDir;
  }

  // 列出指定目录下的所有文件和文件夹
  async listFiles(sectionName, subPath = '') {
    try {
      const sectionDir = await this.getSectionDirectory(sectionName, subPath);
      const items = await fs.readdir(sectionDir, { encoding: 'utf8' });
      
      const fileInfoPromises = items.map(async (item) => {
        const itemPath = path.join(sectionDir, item);
        const stats = await fs.stat(itemPath);
        
        // 尝试修复中文文件名编码问题
        let itemName = item;
        try {
          // 首先尝试UTF-8解码
          itemName = Buffer.from(item, 'binary').toString('utf8');
          // 如果包含乱码字符，尝试使用系统默认编码
          if (itemName.includes('') || /[]/.test(itemName)) {
            itemName = Buffer.from(item, 'binary').toString('gbk');
          }
        } catch (e) {
          // 如果UTF-8解码失败，尝试GBK编码
          try {
            itemName = Buffer.from(item, 'binary').toString('gbk');
          } catch (e2) {
            // 如果都失败了，使用原始文件名
            itemName = item;
          }
        }
        
        return {
          name: itemName,
          path: itemPath,
          isDirectory: stats.isDirectory(),
          modified: stats.mtime,
          size: stats.size,
        };
      });
      
      const fileInfos = await Promise.all(fileInfoPromises);
      return fileInfos;
    } catch (error) {
      loggerService.error(`Failed to list files: ${error.message}`);
      return [];
    }
  }
}

module.exports = new FileManagerService();