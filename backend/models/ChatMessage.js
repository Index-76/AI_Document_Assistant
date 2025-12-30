/**
 * 聊天消息模型
 */
class ChatMessage {
  constructor(text, isUser, isToolCall = false) {
    if (typeof text !== 'string' || text.trim() === '') {
      throw new Error('Text is required and must be a non-empty string');
    }
    
    this.text = text;
    this.isUser = !!isUser; // 确保值为布尔类型
    this.isToolCall = !!isToolCall; // 确保值为布尔类型
    this.createdAt = new Date(); // 添加创建时间
    this.id = this.generateId(); // 添加唯一ID
  }

  // 生成唯一ID
  generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
  }

  // 验证消息
  validate() {
    const errors = [];
    
    if (typeof this.text !== 'string' || this.text.trim() === '') {
      errors.push('Text is required and must be a non-empty string');
    }
    
    if (typeof this.isUser !== 'boolean') {
      errors.push('isUser must be a boolean');
    }
    
    if (typeof this.isToolCall !== 'boolean') {
      errors.push('isToolCall must be a boolean');
    }
    
    if (errors.length > 0) {
      throw new Error(`Validation errors: ${errors.join(', ')}`);
    }
    
    return true;
  }

  // 转换为JSON格式
  toJSON() {
    return {
      id: this.id,
      text: this.text,
      isUser: this.isUser,
      isToolCall: this.isToolCall,
      createdAt: this.createdAt.toISOString()
    };
  }

  // 从JSON创建实例
  static fromJSON(json) {
    if (!json || typeof json !== 'object') {
      throw new Error('Invalid JSON object provided');
    }

    const message = new ChatMessage(json.text, json.isUser, json.isToolCall);
    if (json.id) message.id = json.id;
    if (json.createdAt) message.createdAt = new Date(json.createdAt);
    
    return message;
  }
}

module.exports = ChatMessage;