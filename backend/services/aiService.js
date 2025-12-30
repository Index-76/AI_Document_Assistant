require("dotenv").config();
const axios = require('axios');
const configService = require('./configService');
const { AiPromptConfig } = require('./AiPromptConfig');

class aiService {
  // 发送消息到AI API
  static async sendMessage(text, history = []) {
    const modelName = configService.get('chatModelName');
    return await this._sendMessageWithModel(text, modelName, history);
  }

  // 询问文档问题
  static async askQuestion(question, documentText) {
    // 构建专门针对文档问答的提示词，不包含系统提示，系统提示在_buildMessages中处理
    const prompt = `
      请根据以下文档内容回答问题：
      
      文档内容：
      ${documentText}
      
      问题：
      ${question}
      
      请提供准确且相关的答案：
    `;

    return await this._sendMessageWithModel(prompt, configService.get('chatModelName'), []);
  }

  // 总结文档
  static async summarizeDocument(documentText, maxSentences = 5) {
    // 构建专门针对文档总结的提示词，不包含系统提示，系统提示在_buildMessages中处理
    const prompt = `
      请总结以下文档内容，限制在${maxSentences}句话内：
      
      文档内容：
      ${documentText}
      
      总结：
    `;

    return await this._sendMessageWithModel(prompt, configService.get('chatModelName'), []);
  }

  // 发送消息到指定模型的AI API
  static async _sendMessageWithModel(text, modelName, history) {
    try {
      const baseUrl = configService.get('siliconFlowBaseUrl');
      const apiKey = configService.get('siliconFlowApiKey');

      // 构建消息历史
      const messages = this._buildMessages(history, text);

      // 使用硅基流动(SiliconFlow)的DeepSeek API - 构建完整请求URL
      const apiUrl = `${baseUrl}/chat/completions`;
      
      // 输出发送给AI的内容，不包含系统提示词
      console.log('发送给AI的消息内容:', messages);
      
      const response = await axios.post(
        apiUrl,  // 使用完整URL
        {
          model: modelName,
          messages: messages,
          stream: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          timeout: 30000, // 添加30秒超时设置，避免socket hang up错误
        }
      );

      if (response.status === 200) {
        const data = response.data;
        const aiResponse = data.choices[0].message.content;
        console.log('AI返回的响应内容:', aiResponse);
        return aiResponse;
      } else {
        console.error(`API请求失败，状态码: ${response.status}`);
        console.error(`响应数据:`, response.data);
        return `API请求失败，状态码: ${response.status}`;
      }
    } catch (e) {
      console.error('API调用错误详情:', e.message);
      
      // 检查错误类型
      if (e.response) {
        console.error('响应状态:', e.response.status);
        console.error('响应数据:', e.response.data);
        console.error('请求URL:', e.config.url);
        console.error('请求数据:', e.config.data);
        
        // 如果是400错误，返回更具体的信息
        if (e.response.status === 400) {
          return `API请求参数错误: ${e.response.data?.error?.message || e.response.data || e.message}`;
        } else {
          return `API请求失败: ${e.response.data?.error?.message || e.message}`;
        }
      } else if (e.request) {
        console.error('请求对象:', e.request);
        return 'API请求未收到响应，请检查网络连接';
      } else {
        console.error('请求配置错误:', e.config);
        return `请求配置错误: ${e.message}`;
      }
    }
  }

  // 构建消息历史
  static _buildMessages(history, currentText) {
    const messages = [];

    // 添加系统提示 - 从AiPromptConfig获取
    messages.push({
      role: 'system',
      content: AiPromptConfig.systemPrompt,
    });

    // 添加历史消息
    for (const item of history) {
      messages.push({
        role: item.isUser ? 'user' : 'assistant',
        content: item.text,
      });
    }

    // 添加当前用户消息
    messages.push({
      role: 'user',
      content: currentText,
    });

    return messages;
  }

  // 发送消息到分析AI API（用于字段提取等分析任务）
  static async sendAnalysisRequest(text) {
    const modelName = configService.get('analysisModelName');
    return await this._sendMessageWithModel(text, modelName, []);
  }

  // 发送消息到决策AI API（用于工具调用决策）
  static async sendDecisionRequest(text) {
    const modelName = configService.get('decisionModelName');
    return await this._sendMessageWithModel(text, modelName, []);
  }
}

module.exports = aiService;