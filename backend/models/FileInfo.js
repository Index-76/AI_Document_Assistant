/**
 * 文件信息模型
 */
class FileInfo {
  constructor(name, path, isDirectory, modified, size) {
    this.name = name;
    this.path = path;
    this.isDirectory = !!isDirectory; // 确保值为布尔类型
    this.modified = modified instanceof Date ? modified : new Date(modified);
    this.size = size && typeof size === 'number' ? size : 0;
    this.createdAt = new Date(); // 添加创建时间
  }

  // 验证文件信息
  validate() {
    const errors = [];
    
    if (typeof this.name !== 'string' || this.name.trim() === '') {
      errors.push('Name is required and must be a non-empty string');
    }
    
    if (typeof this.path !== 'string' || this.path.trim() === '') {
      errors.push('Path is required and must be a non-empty string');
    }
    
    if (typeof this.isDirectory !== 'boolean') {
      errors.push('isDirectory must be a boolean');
    }
    
    if (!(this.modified instanceof Date) || isNaN(this.modified.getTime())) {
      errors.push('Modified must be a valid Date object');
    }
    
    if (typeof this.size !== 'number' || this.size < 0) {
      errors.push('Size must be a non-negative number');
    }
    
    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
    
    return true;
  }

  // 获取文件大小的可读格式
  getReadableSize() {
    if (this.size === 0) return '0 Bytes';
    
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(this.size) / Math.log(1024));
    
    return Math.round((this.size / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  }

  // 检查是否为文件（而非目录）
  isFile() {
    return !this.isDirectory;
  }

  // 检查文件扩展名
  getExtension() {
    if (this.isDirectory) return null;
    return this.name.includes('.') ? this.name.split('.').pop().toLowerCase() : '';
  }

  // 转换为JSON格式
  toJSON() {
    return {
      name: this.name,
      path: this.path,
      isDirectory: this.isDirectory,
      modified: this.modified.toISOString(),
      size: this.size,
      createdAt: this.createdAt.toISOString()
    };
  }

  // 从JSON创建实例
  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid JSON object provided');
    }

    const fileInfo = new FileInfo(
      json.name, 
      json.path, 
      json.isDirectory, 
      json.modified ? new Date(json.modified) : new Date(), 
      json.size || 0
    );
    
    if (json.createdAt) fileInfo.createdAt = new Date(json.createdAt);
    
    return fileInfo;
  }
}

module.exports = FileInfo;