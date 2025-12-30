const loggerService = require('./loggerService');

// 使用环境变量或默认值作为配置
class ExternalConfigService {
  constructor() {
    // 初始化配置为环境变量
    this.config = this._getDefaultConfig();
  }

  // 初始化配置服务
  init() {
    // 现在配置直接从环境变量获取，不需要异步加载
    this.config = this._getDefaultConfig();
    loggerService.info('配置服务初始化完成，使用环境变量');
  }

  // 获取默认配置（从环境变量）
  _getDefaultConfig() {
    return {
      'port': process.env.PORT || 2070,
      'siliconFlowApiKey': process.env.SILICON_FLOW_API_KEY || '',
      'siliconFlowBaseUrl': process.env.SILICON_FLOW_BASE_URL || 'https://api.siliconflow.cn/v1',
      'chatModelName': process.env.CHAT_MODEL_NAME || 'deepseek-ai/DeepSeek-V3.2',
      'decisionModelName': process.env.DECISION_MODEL_NAME || 'Qwen/Qwen2.5-7B-Instruct',
      'analysisModelName': process.env.ANALYSIS_MODEL_NAME || 'deepseek-ai/DeepSeek-V3.2',
      // 数据库配置
      'databaseUrl': process.env.DATABASE_URL || '',
      'databaseUsername': process.env.DATABASE_USERNAME || '',
      'databasePassword': process.env.DATABASE_PASSWORD || '',
      'databaseTableName': process.env.DATABASE_TABLE_NAME || '',
      'databaseType': process.env.DATABASE_TYPE || '',
      'databaseName': process.env.DATABASE_NAME || '',
    };
  }

  // 获取配置值
  get(key) {
    return this.config[key];
  }

  // 设置配置值 - 仅在运行时修改，不会保存到文件
  set(key, value) {
    this.config[key] = value;
  }

  // 批量更新配置 - 仅在运行时修改，不会保存到文件
  updateConfig(newConfig) {
    Object.assign(this.config, newConfig);
  }

  // 获取所有配置
  getAllConfig() {
    return { ...this.config };
  }

  // 检查API密钥是否已设置
  isApiKeySet() {
    const apiKey = this.get('siliconFlowApiKey');
    return apiKey != null && apiKey !== '';
  }
}

// 创建单例实例
const configService = new ExternalConfigService();

// 初始化配置服务
configService.init();

module.exports = configService;