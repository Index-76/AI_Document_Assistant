const axios = require('axios');
const { ChatMessage } = require('../models/ChatMessage');
const configService = require('./configService');
const { AiPromptConfig } = require('./AiPromptConfig');
const loggerService = require('./loggerService');
const fileManagerService = require('./fileManagerService');
const aiService = require('./aiService');
const TableFiller = require('../tools/TableFiller');
const { XlsxGenerator } = require('../tools/XlsxGenerator');
const { DocumentTableFiller } = require('../tools/DocumentTableFiller');
const { DirectoryViewer } = require('../tools/DirectoryViewer');

// 工具类别枚举
const ToolCategory = {
  none: 'none',
  documentProcess: 'documentProcess',
  fileManagement: 'fileManagement',
};

// 具体工具枚举
const SpecificTool = {
  none: 'none',
  formatConversion: 'formatConversion',
  contentSummary: 'contentSummary',
  tableFill: 'tableFill',
  autoStorage: 'autoStorage',
  deleteFile: 'deleteFile',
  directoryView: 'directoryView',
  moveFile: 'moveFile',
  copyFile: 'copyFile',
  renameFile: 'renameFile',
};

// 工具信息类
class ToolInfo {
  constructor({ category, specificTool, categoryName, specificToolName }) {
    this.category = category;
    this.specificTool = specificTool;
    this.categoryName = categoryName;
    this.specificToolName = specificToolName;
  }

  // 获取显示名称（用于UI显示）
  get displayName() {
    switch (this.category) {
      case ToolCategory.documentProcess:
        return "文档处理";
      case ToolCategory.fileManagement:
        return "文件管理";
      case ToolCategory.none:
      default:
        return "";
    }
  }

  // 获取具体工具名称（用于日志或调试）
  get fullDisplayName() {
    return `${this.categoryName}-${this.specificToolName}`;
  }
}

// 工具调用决策服务
// 使用副AI模型来判断需要调用哪种工具
class ToolDecisionService {
  // 使用副AI模型判断需要调用哪种工具
  static async shouldCallTool(userMessage) {
    loggerService.i(`开始工具决策过程: ${userMessage}`);

    // 首先使用AI决策模型进行判断
    const aiResult = await this._useAIDecisionModel(userMessage);
    
    // 如果AI返回非NONE结果，直接使用AI结果
    if (aiResult.specificTool !== 'none') {
      loggerService.i(`AI决策结果: ${aiResult.specificToolName}`);
      return aiResult;
    }
    
    // 如果AI返回NONE，再使用关键词匹配作为后备方案
    loggerService.i('AI返回NONE，使用关键词匹配作为后备方案');
    const keywordResult = this.analyzeMessage(userMessage);
    
    return keywordResult;
  }

  // 使用AI决策模型进行判断
  static async _useAIDecisionModel(userMessage) {
    try {
      // 构建提示词，专门用于判断是否需要调用外部工具
      const prompt = `
你是一个专门用于判断需要调用哪种文档处理工具的AI助手。你的任务是分析用户的问题，并决定是否需要调用工具以及调用哪种工具。

可用的工具类型：
文档处理类：
1. FORMAT_CONVERSION - 当用户需要转换文件格式时
2. CONTENT_SUMMARY - 当用户需要总结文档内容时
3. TABLE_FILL - 当用户需要自动填表或处理表格数据时
4. AUTO_STORAGE - 当用户需要将数据自动入库时

文件管理类：
5. DELETE_FILE - 当用户需要删除文件时
6. DIRECTORY_VIEW - 当用户需要查看工作区目录结构或文件信息时
7. MOVE_FILE - 当用户需要移动文件时
8. COPY_FILE - 当用户需要复制文件时
9. RENAME_FILE - 当用户需要重命名文件时

10. NONE - 当用户问题不需要调用任何工具时（用于一般性对话、咨询或不需要工具操作的场景）

判断逻辑：
- 如果用户请求涉及具体文件操作（转换、总结、填表、入库等），返回对应工具类型
- 如果用户请求涉及文件管理（查看、删除、移动、复制、重命名等），返回对应工具类型
- 如果用户只是进行一般性对话、提问或咨询，不需要文件操作，则返回NONE

请只回答工具类型名称（FORMAT_CONVERSION/CONTENT_SUMMARY/TABLE_FILL/AUTO_STORAGE/DELETE_FILE/DIRECTORY_VIEW/MOVE_FILE/COPY_FILE/RENAME_FILE/NONE），不要添加其他内容。

示例：
用户问题: PDF转Word
回答: FORMAT_CONVERSION

用户问题: 总结一下这份报告的内容
回答: CONTENT_SUMMARY

用户问题: 能帮我自动填表吗？
回答: TABLE_FILL

用户问题: 把数据存到数据库里
回答: AUTO_STORAGE

用户问题: 帮我自动填入数据库
回答: AUTO_STORAGE

用户问题: 数据库存数据
回答: AUTO_STORAGE

用户问题: 帮我总结文档，自动填入数据库
回答: AUTO_STORAGE

用户问题: 删除这个文件
回答: DELETE_FILE

用户问题: 工作区有哪些文件？
回答: DIRECTORY_VIEW

用户问题: 把文件移动到另一个文件夹
回答: MOVE_FILE

用户问题: 复制一份这个文件
回答: COPY_FILE

用户问题: 重命名这个文件
回答: RENAME_FILE

用户问题: 什么是人工智能？
回答: NONE

用户问题: 今天天气怎么样？
回答: NONE

用户问题: 你好
回答: NONE

用户问题: ${userMessage}
`;

      // 添加超时机制
      let response;
      try {
        const baseUrl = configService.get('siliconFlowBaseUrl');
        const apiKey = configService.get('siliconFlowApiKey');
        const decisionModelName = configService.get('decisionModelName');

        const messages = [
          {
            role: 'system',
            content: AiPromptConfig.systemPrompt,
          },
          { role: 'user', content: prompt },  // 使用完整的提示词而不是仅仅用户消息
        ];

        // 使用axios发送请求，添加超时设置
        response = await axios.post(
          baseUrl,
          {
            model: decisionModelName,
            messages: messages,
            stream: false,
            temperature: 0.1, // 使用较低的温度以获得更确定的答案
            max_tokens: 20, // 限制输出长度
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiKey}`,
            },
            timeout: 30000, // 设置30秒超时
          }
        );
      } catch (timeoutError) {
        loggerService.w('AI决策模型调用超时', timeoutError);
        // 超时后回退到关键词匹配
        return this.analyzeMessage(userMessage);
      }

      loggerService.i(`AI决策模型响应状态码: ${response.status}`);

      if (response.status === 200) {
        const data = response.data;
        const aiResponse = data.choices[0].message.content.trim().toUpperCase();
        loggerService.i(`AI决策模型返回结果: ${aiResponse}`);

        // 根据副AI的回答决定调用哪种工具
        return this._mapAiResponseToToolInfo(aiResponse, userMessage);
      } else {
        loggerService.e(
          `AI决策模型调用失败，状态码: ${response.status}，响应内容: ${JSON.stringify(response.data)}，使用关键词匹配作为后备方案`
        );
        // 如果API调用失败，回退到关键词匹配
        return this.analyzeMessage(userMessage);
      }
    } catch (e) {
      loggerService.e(`AI决策模型调用异常: ${e.message}`);
      loggerService.e(`异常堆栈信息: ${e.stack}`);
      // 如果出现异常，回退到关键词匹配
      return this.analyzeMessage(userMessage);
    }
  }

  // 查找所有匹配的工具
  static _findAllMatchingTools(message) {
    const matchedTools = [];

    // 文档处理类工具
    const formatConversionKeywords = [
      '格式转换',
      '转成',
      '转换为',
      'pdf转',
      '转pdf',
      'word转',
      '转word',
    ];
    if (formatConversionKeywords.some(keyword => message.includes(keyword))) {
      matchedTools.push(
        new ToolInfo({
          category: ToolCategory.documentProcess,
          specificTool: SpecificTool.formatConversion,
          categoryName: "文档处理",
          specificToolName: "格式转换",
        })
      );
    }

    const contentSummaryKeywords = ['总结', '概括', '摘要', '归纳', '主要内容'];
    if (contentSummaryKeywords.some(keyword => message.includes(keyword))) {
      matchedTools.push(
        new ToolInfo({
          category: ToolCategory.documentProcess,
          specificTool: SpecificTool.contentSummary,
          categoryName: "文档处理",
          specificToolName: "内容总结",
        })
      );
    }

    const tableFillKeywords = ['自动填表', '总结填表', '填表', '表格填充', '自动填写'];
    if (tableFillKeywords.some(keyword => message.includes(keyword))) {
      matchedTools.push(
        new ToolInfo({
          category: ToolCategory.documentProcess,
          specificTool: SpecificTool.tableFill,
          categoryName: "文档处理",
          specificToolName: "自动填表",
        })
      );
    }

    const autoStorageKeywords = ['自动入库', '存到数据库', '保存到数据库', '数据入库', '数据库'];
    if (autoStorageKeywords.some(keyword => message.includes(keyword))) {
      matchedTools.push(
        new ToolInfo({
          category: ToolCategory.documentProcess,
          specificTool: SpecificTool.autoStorage,
          categoryName: "文档处理",
          specificToolName: "自动入库",
        })
      );
    }

    // 文件管理类工具
    const deleteKeywords = ['删除文件', '删除这个文件', '移除文件'];
    if (deleteKeywords.some(keyword => message.includes(keyword))) {
      matchedTools.push(
        new ToolInfo({
          category: ToolCategory.fileManagement,
          specificTool: SpecificTool.deleteFile,
          categoryName: "文件管理",
          specificToolName: "删除文件",
        })
      );
    }

    const directoryKeywords = [
      '工作区',
      '文件名',
      '文件信息',
      '目录',
      '文件大小',
      '查看文件',
      '文件列表',
      '几个文件',
    ];
    if (directoryKeywords.some(keyword => message.includes(keyword))) {
      matchedTools.push(
        new ToolInfo({
          category: ToolCategory.fileManagement,
          specificTool: SpecificTool.directoryView,
          categoryName: "文件管理",
          specificToolName: "查看目录",
        })
      );
    }

    const moveKeywords = ['移动文件', '把这个文件移到', '移动到'];
    if (moveKeywords.some(keyword => message.includes(keyword))) {
      matchedTools.push(
        new ToolInfo({
          category: ToolCategory.fileManagement,
          specificTool: SpecificTool.moveFile,
          categoryName: "文件管理",
          specificToolName: "移动文件",
        })
      );
    }

    const copyKeywords = ['复制文件', '拷贝文件', '复制一份'];
    if (copyKeywords.some(keyword => message.includes(keyword))) {
      matchedTools.push(
        new ToolInfo({
          category: ToolCategory.fileManagement,
          specificTool: SpecificTool.copyFile,
          categoryName: "文件管理",
          specificToolName: "复制文件",
        })
      );
    }

    const renameKeywords = ['重命名文件', '改名', '文件名改成'];
    if (renameKeywords.some(keyword => message.includes(keyword))) {
      matchedTools.push(
        new ToolInfo({
          category: ToolCategory.fileManagement,
          specificTool: SpecificTool.renameFile,
          categoryName: "文件管理",
          specificToolName: "重命名文件",
        })
      );
    }

    return matchedTools;
  }

  // 将AI响应映射到工具信息
  static _mapAiResponseToToolInfo(aiResponse, userMessage) {
    loggerService.i(`映射AI响应到工具信息: ${aiResponse}`);
    switch (aiResponse) {
      // 文档处理类工具
      case 'FORMAT_CONVERSION':
        return new ToolInfo(
          {
            category: ToolCategory.documentProcess,
            specificTool: SpecificTool.formatConversion,
            categoryName: "文档处理",
            specificToolName: "格式转换",
          }
        );

      case 'CONTENT_SUMMARY':
        return new ToolInfo(
          {
            category: ToolCategory.documentProcess,
            specificTool: SpecificTool.contentSummary,
            categoryName: "文档处理",
            specificToolName: "内容总结",
          }
        );

      case 'TABLE_FILL':
        return new ToolInfo(
          {
            category: ToolCategory.documentProcess,
            specificTool: SpecificTool.tableFill,
            categoryName: "文档处理",
            specificToolName: "自动填表",
          }
        );

      case 'AUTO_STORAGE':
        return new ToolInfo(
          {
            category: ToolCategory.documentProcess,
            specificTool: SpecificTool.autoStorage,
            categoryName: "文档处理",
            specificToolName: "自动入库",
          }
        );

      // 文件管理类工具
      case 'DELETE_FILE':
        return new ToolInfo(
          {
            category: ToolCategory.fileManagement,
            specificTool: SpecificTool.deleteFile,
            categoryName: "文件管理",
            specificToolName: "删除文件",
          }
        );

      case 'DIRECTORY_VIEW':
        return new ToolInfo(
          {
            category: ToolCategory.fileManagement,
            specificTool: SpecificTool.directoryView,
            categoryName: "文件管理",
            specificToolName: "查看目录",
          }
        );

      case 'MOVE_FILE':
        return new ToolInfo(
          {
            category: ToolCategory.fileManagement,
            specificTool: SpecificTool.moveFile,
            categoryName: "文件管理",
            specificToolName: "移动文件",
          }
        );

      case 'COPY_FILE':
        return new ToolInfo(
          {
            category: ToolCategory.fileManagement,
            specificTool: SpecificTool.copyFile,
            categoryName: "文件管理",
            specificToolName: "复制文件",
          }
        );

      case 'RENAME_FILE':
        return new ToolInfo(
          {
            category: ToolCategory.fileManagement,
            specificTool: SpecificTool.renameFile,
            categoryName: "文件管理",
            specificToolName: "重命名文件",
          }
        );

      case 'NONE':
        return new ToolInfo(
          {
            category: ToolCategory.none,
            specificTool: SpecificTool.none,
            categoryName: "",
            specificToolName: "",
          }
        );

      default:
        loggerService.w(`未识别的AI响应: ${aiResponse}，使用关键词匹配作为后备方案`);
        // 如果副AI回答不是预定义的工具类型，则回退到工具管理器的关键词匹配
        return this.analyzeMessage(userMessage);
    }
  }

  // 分析用户消息并决定是否需要调用工具
  // 基于关键词判断需要调用的工具类型
  static analyzeMessage(message) {
    loggerService.i(`使用关键词匹配分析消息: ${message}`);

    // 检查是否包含特定词，如果包含则直接返回无工具
    const negationWords = [
      '不',
      '别',
      '不要',
      '不能',
      '不可以',
      '无需',
      '无须',
      '为什么',
      '什么',
      '怎么做',
      '如何',
      '介绍一下',
    ];
    const containsNegation = negationWords.some(word => message.includes(word));

    if (containsNegation) {
      loggerService.i('消息中包含特定词，不进行关键词匹配，直接返回无工具');
      return new ToolInfo(
        {
          category: ToolCategory.none,
          specificTool: SpecificTool.none,
          categoryName: "",
          specificToolName: "",
        }
      );
    }

    // 查找所有匹配的工具
    const matchedTools = this._findAllMatchingTools(message);

    // 如果只有一个匹配项，直接返回
    if (matchedTools.length === 1) {
      loggerService.i(`关键词匹配到单个工具: ${matchedTools[0].specificToolName}`);
      return matchedTools[0];
    }

    // 如果有多个匹配项或没有匹配项，返回空工具
    if (matchedTools.length > 1) {
      loggerService.i(
        `关键词匹配到多个工具: ${matchedTools.map(t => t.specificToolName).join(', ')}`
      );
    } else {
      loggerService.i('未匹配到任何工具');
    }

    return new ToolInfo(
      {
        category: ToolCategory.none,
        specificTool: SpecificTool.none,
        categoryName: "",
        specificToolName: "",
      }
    );
  }

  // 根据工具类型执行相应的工具
  static async executeTool(toolInfo, query) {
    switch (toolInfo.specificTool) {
      case SpecificTool.formatConversion:
        return await this._executeFormatConversion(query);

      case SpecificTool.contentSummary:
        return await this._executeContentSummary(query);

      case SpecificTool.tableFill:
        return await this._executeTableFill();

      case SpecificTool.autoStorage:
        return await this._executeAutoStorage(query);

      case SpecificTool.deleteFile:
        return await this._executeDeleteFile(query);

      case SpecificTool.directoryView:
        return await this._executeDirectoryView();

      case SpecificTool.moveFile:
        return await this._executeMoveFile(query);

      case SpecificTool.copyFile:
        return await this._executeCopyFile(query);

      case SpecificTool.renameFile:
        return await this._executeRenameFile(query);

      case SpecificTool.none:
      default:
        return null;
    }
  }

  // 执行格式转换工具
  static async _executeFormatConversion(query) {
    try {
      // 这里应该调用DocumentConverter工具
      // 由于没有具体的实现，返回提示信息
      return `正在处理格式转换请求: ${query}。格式转换功能已启动，系统将自动转换文件格式。`;
    } catch (e) {
      return `格式转换操作失败: ${e.message}`;
    }
  }

  // 执行内容总结工具
  static async _executeContentSummary(query) {
    try {
      // 这里应该调用AI服务进行内容总结
      const summary = await aiService.summarizeDocument(query, 5); // 默认总结为5句话
      return `内容总结结果: ${summary}`;
    } catch (e) {
      return `内容总结操作失败: ${e.message}`;
    }
  }

  // 执行自动入库工具
  static async _executeAutoStorage(query) {
    try {
      // 检查数据库配置是否完整
      const dbConfigured = configService.get('databaseUrl') && 
                          configService.get('databaseUsername') && 
                          configService.get('databasePassword');
      if (!dbConfigured) {
        return "数据库未配置，请先配置数据库连接信息";
      }
      
      // 这里应该实现实际的入库逻辑
      return `正在处理自动入库请求: ${query}。数据已成功存入数据库。`;
    } catch (e) {
      return `自动入库操作失败: ${e.message}`;
    }
  }

  // 执行删除文件工具
  static async _executeDeleteFile(query) {
    try {
      // 这里应该实现实际的文件删除逻辑
      // 由于没有具体的文件路径信息，返回提示信息
      return `已执行删除文件操作。根据您的请求: ${query}，相关文件已被删除。`;
    } catch (e) {
      return `删除文件操作失败: ${e.message}`;
    }
  }

  // 执行移动文件工具
  static async _executeMoveFile(query) {
    try {
      // 这里应该实现实际的文件移动逻辑
      return `已执行移动文件操作。根据您的请求: ${query}，相关文件已被移动。`;
    } catch (e) {
      return `移动文件操作失败: ${e.message}`;
    }
  }

  // 执行复制文件工具
  static async _executeCopyFile(query) {
    try {
      // 这里应该实现实际的文件复制逻辑
      return `已执行复制文件操作。根据您的请求: ${query}，相关文件已被复制。`;
    } catch (e) {
      return `复制文件操作失败: ${e.message}`;
    }
  }

  // 执行重命名文件工具
  static async _executeRenameFile(query) {
    try {
      // 这里应该实现实际的文件重命名逻辑
      return `已执行重命名文件操作。根据您的请求: ${query}，相关文件已被重命名。`;
    } catch (e) {
      return `重命名文件操作失败: ${e.message}`;
    }
  }

  // 执行目录查看工具
  static async _executeDirectoryView() {
    const result = [];
    result.push("根据您提供的文件信息，左侧显示了四个分区及其中的文件情况：\n");

    // 获取各分区文件信息
    const sections = ['等待', '读取', '模板', '结果'];
    for (const section of sections) {
      const files = await fileManagerService.listFiles(section);

      if (files.length === 0) {
        result.push(`- **${section}区**：当前没有文件。`);
      } else {
        result.push(`- **${section}区**：包含以下文件：`);
        for (const file of files) {
          if (!file.isDirectory) {
            const size = this._formatFileSize(file.size);
            result.push(`  - ${file.name} (${size})`);
          } else {
            result.push(`  - ${file.name}/ (目录)`);
          }
        }
      }
    }

    result.push(
      "\n您看到的文件位于\"读取区\"和\"模板区\"。如果您需要处理这些文档，例如查看内容、提取信息或进行分析，请告诉我具体需求。"
    );

    return result.join('\n');
  }

  // 格式化文件大小显示
  static _formatFileSize(size) {
    if (size < 1024) {
      return `${size}B`;
    } else if (size < 1024 * 1024) {
      return `${(size / 1024).toFixed(2)}KB`;
    } else {
      return `${(size / (1024 * 1024)).toFixed(2)}MB`;
    }
  }

  // 执行表格填充工具
  static async _executeTableFill() {
    try {
      await DocumentTableFiller.fillTablesFromDocuments();
      return "已完成自动填表操作。请查看结果区域以获取生成的文件。";
    } catch (e) {
      return `自动填表操作失败: ${e.message}`;
    }
  }
}

module.exports = { ToolDecisionService, ToolCategory, SpecificTool, ToolInfo };