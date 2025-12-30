const fs = require('fs').promises;
const path = require('path');

// 日志级别枚举
const LogLevel = {
  verbose: 0,
  debug: 1,
  info: 2,
  warning: 3,
  error: 4,
};

// 日志服务类
class LoggerService {
  constructor() {
    this._currentLevel = LogLevel.info;
    this._logFilePath = path.join(process.cwd(), 'logs', 'app.log');
    this._ensureLogDirectory();
  }

  // 确保日志目录存在
  async _ensureLogDirectory() {
    const logDir = path.dirname(this._logFilePath);
    try {
      await fs.access(logDir);
    } catch {
      await fs.mkdir(logDir, { recursive: true });
    }
  }

  // 设置日志级别
  setLogLevel(level) {
    this._currentLevel = level;
  }

  // 输出verbose级别的日志
  v(message, error, stackTrace) {
    this._log(LogLevel.verbose, message, error, stackTrace);
  }

  // 输出debug级别的日志
  d(message, error, stackTrace) {
    this._log(LogLevel.debug, message, error, stackTrace);
  }

  // 输出info级别的日志
  i(message, error, stackTrace) {
    this._log(LogLevel.info, message, error, stackTrace);
  }

  // 输出warning级别的日志
  w(message, error, stackTrace) {
    this._log(LogLevel.warning, message, error, stackTrace);
  }

  // 输出error级别的日志
  e(message, error, stackTrace) {
    this._log(LogLevel.error, message, error, stackTrace);
  }

  // Express中间件：记录请求日志
  logRequest(req, res, next) {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.url;
    const userAgent = req.get && req.get('User-Agent') || 'Unknown';
    
    // 使用console.log作为后备，如果loggerService方法不可用
    try {
      this.i(`${method} ${url} - User-Agent: ${userAgent}`);
    } catch (error) {
      console.log(`[${timestamp}] INFO: ${method} ${url} - User-Agent: ${userAgent}`);
    }
    
    // 继续处理请求
    next();
  }

  // 实际的日志输出方法
  async _log(level, message, error, stackTrace) {
    // 检查当前日志级别是否应该输出
    if (!this._shouldLog(level)) return;

    const levelStr = Object.keys(LogLevel).find(key => LogLevel[key] === level).toUpperCase();
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${levelStr}: ${message}`;
    
    // 控制台输出日志
    console.log(logMessage);
    
    if (error) {
      console.log(`Error: ${error}`);
    }
    
    if (stackTrace) {
      console.log(`StackTrace:\n${stackTrace}`);
    }

    // 异步写入日志文件
    this._writeToFile(logMessage, error, stackTrace);
  }

  // 写入日志到文件
  async _writeToFile(message, error, stackTrace) {
    try {
      let logEntry = `${message}\n`;
      if (error) {
        logEntry += `Error: ${error}\n`;
      }
      if (stackTrace) {
        logEntry += `StackTrace:\n${stackTrace}\n`;
      }
      logEntry += '\n'; // 添加空行分隔日志条目

      await fs.appendFile(this._logFilePath, logEntry);
    } catch (writeError) {
      // 避免因日志写入失败导致程序崩溃
      console.error('写入日志文件失败:', writeError);
    }
  }

  // 判断是否应该输出指定级别的日志
  _shouldLog(level) {
    const levels = Object.values(LogLevel);
    return levels.indexOf(level) >= levels.indexOf(this._currentLevel);
  }
}

// 创建全局日志服务实例
const loggerService = new LoggerService();

// 为兼容性提供别名
loggerService.info = loggerService.i;
loggerService.error = loggerService.e;
loggerService.warn = loggerService.w;
loggerService.debug = loggerService.d;
loggerService.verbose = loggerService.v;

module.exports = loggerService;