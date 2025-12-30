const fileManagerService = require('../services/fileManagerService');

/**
 * 目录查看工具类
 * 提供查看各个数据区域目录的功能
 */
class DirectoryViewer {
  /**
   * 查看等待区目录
   * 返回等待区目录中的所有文件和子目录列表
   */
  static async viewWaitDirectory() {
    const dir = await fileManagerService.getSectionDirectory('等待');
    return this._listDirectory(dir);
  }

  /**
   * 查看读取区目录
   * 返回读取区目录中的所有文件和子目录列表
   */
  static async viewReadDirectory() {
    const dir = await fileManagerService.getSectionDirectory('读取');
    return this._listDirectory(dir);
  }

  /**
   * 查看模板区目录
   * 返回模板区目录中的所有文件和子目录列表
   */
  static async viewTemplateDirectory() {
    const dir = await fileManagerService.getSectionDirectory('模板');
    return this._listDirectory(dir);
  }

  /**
   * 查看结果区目录
   * 返回结果区目录中的所有文件和子目录列表
   */
  static async viewResultDirectory() {
    const dir = await fileManagerService.getSectionDirectory('结果');
    return this._listDirectory(dir);
  }

  /**
   * 列出指定目录中的所有文件和子目录
   */
  static async _listDirectory(dir) {
    const fs = require('fs');
    const path = require('path');

    if (!fs.existsSync(dir)) {
      return [`目录不存在: ${dir}`];
    }

    try {
      const entities = fs.readdirSync(dir, { withFileTypes: true });
      if (entities.length === 0) {
        return ['目录为空'];
      }

      return entities.map((entity) => {
        let filename = path.basename(entity.name);
        
        // 处理文件名编码问题
        try {
          // 尝试修复可能的编码问题
          filename = Buffer.from(filename, 'binary').toString('utf8');
          // 如果包含乱码字符，尝试使用系统默认编码
          if (filename.includes('') || /[\uFFFD]/.test(filename)) {
            filename = Buffer.from(entity.name, 'binary').toString('gbk');
          }
        } catch (e) {
          // 如果UTF-8解码失败，尝试GBK编码
          try {
            filename = Buffer.from(entity.name, 'binary').toString('gbk');
          } catch (e2) {
            // 如果都失败了，使用原始文件名
            filename = path.basename(entity.name);
          }
        }
        
        return entity.isDirectory() ? `${filename}/` : filename;
      });
    } catch (e) {
      return [`读取目录失败: ${e.message}`];
    }
  }
}

module.exports = { DirectoryViewer };