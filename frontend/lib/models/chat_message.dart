class ChatMessage {
  final String id;
  final String content;
  final String sender;
  final DateTime timestamp;
  final String? toolType;  // 工具类型，如果消息是工具响应
  final dynamic toolResult; // 工具结果，如果消息是工具响应

  ChatMessage({
    required this.id,
    required this.content,
    required this.sender,
    required this.timestamp,
    this.toolType,
    this.toolResult,
  });

  // 工厂构造函数，用于创建用户消息
  factory ChatMessage.user(String content) {
    return ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      content: content,
      sender: 'user',
      timestamp: DateTime.now(),
    );
  }

  // 工厂构造函数，用于创建AI消息
  factory ChatMessage.ai(String content) {
    return ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      content: content,
      sender: 'ai',
      timestamp: DateTime.now(),
    );
  }

  // 工厂构造函数，用于创建工具响应消息
  factory ChatMessage.tool({
    required String content,
    required String toolType,
    required dynamic toolResult,
  }) {
    return ChatMessage(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      content: content,
      sender: 'tool',
      timestamp: DateTime.now(),
      toolType: toolType,
      toolResult: toolResult,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'content': content,
      'sender': sender,
      'timestamp': timestamp.millisecondsSinceEpoch,
      'toolType': toolType,
      'toolResult': toolResult,
    };
  }

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'],
      content: json['content'],
      sender: json['sender'],
      timestamp: DateTime.fromMillisecondsSinceEpoch(json['timestamp']),
      toolType: json['toolType'],
      toolResult: json['toolResult'],
    );
  }
}