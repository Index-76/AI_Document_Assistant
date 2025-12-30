const aiService = require('../services/aiService');
const iconv = require('iconv-lite');
const Buffer = require('buffer').Buffer;

/**
 * 表格填充工具类
 * 用于根据读取区内容与表头、格式填写表格内容
 */
class TableFiller {
  /**
   * 根据读取区内容、表头和格式填写表格
   *
   * 参数:
   * - contentText: 读取区的纯文本内容
   * - headers: 表头列表
   * - format: 表格格式 ("horizontal" 或 "vertical")
   *
   * 返回:
   * - 成功时返回包含填充数据的JSON字符串
   * - 夫败时返回错误信息
   */
  static async fillTableContent(contentText, headers, format) {
    // 构造给AI的完整提示词
    const prompt = `
你是一个数据整理助手。
请严格按以下要求处理：

【输入】
1. 用户提供纯文本格式的内容
2. 用户提供要求填写的Excel的表头（列表格式）
3. 用户提供要求输出的Excel格式（"horizontal" 或 "vertical"）

【处理规则】
1.表头定位：
   - 如果格式为 \`horizontal\`：表头位于第一行。用户提供的表头列表依次填入 R1C1, R1C2, R1C3...
   - 如果格式为 \`vertical\`：表头位于第一列。用户提供的表头列表依次填入 R1C1, R2C1, R3C1...

2.记录识别：
   首先，识别文本中独立的**数据记录**（如不同人员、不同项目等）。识别依据包括：
   明显的分隔符（如空行、分页符、项目符号）
   重复的文本模式
   自然段落分割

3.数据组织：
   当格式为 \`horizontal\` 时：每个独立的数据记录占用一行，从第二行开始。
   当格式为 \`vertical\` 时：每个独立的数据记录占用一列，从第二列开始。

4.数据匹配与填充：
   对于每个数据记录，在对应的文本片段中查找与表头字段语义最接近的内容。
   匹配原则：表头为"姓名"则查找名字、称呼；表头为"金额"则查找数字和货币符号等。
   如果一个文本片段包含多个字段信息（如"张三，工号001"），请拆解后填入对应字段。

5.缺失数据处理：
   如果某个记录中缺少某个字段的信息，在该记录对应的单元格填写"数据丢失"。
   如果整个文本都找不到某个字段的信息，该字段对应的所有数据单元格都填写"数据丢失"。

【坐标规则】
所有行（R）和列（C）的索引均从 1 开始。
当格式为 \`horizontal\` 时：表头占第1行，数据从第2行开始。
当格式为 \`vertical\` 时：表头占第1列，数据从第2列开始。
坐标格式：RxCy 表示第x行第y列。

【输出格式】
输出一个严格的JSON对象，包含以下字段：

1.处理成功时：
{
  "success": true,
  "data": {
    "cells": {
      "R1C1": "表头1",
      "R1C2": "表头2",
      "R2C1": "数据1",
      "R2C2": "数据2",
      ...
    }
  }
}

重要提醒：
- 所有坐标必须从R1C1开始，不要有任何偏移
- 不要留空第一行或第一列
- 确保表头数据从R1C1开始放置
- 必须直接输出JSON格式内容，不得包含任何代码块标记（如\`\`\`json或\`\`\`）
- 不得添加任何解释性文字或其他内容

现在开始处理用户请求：

用户提供的纯文本内容：
${contentText}

用户提供的表头列表：
${JSON.stringify(headers)}

用户要求的表格格式：
${format}

请严格按照上述格式返回JSON，不得添加任何解释或其他内容，只返回纯JSON格式内容。
`;

    try {
      // 调用AI服务填充表格
      const aiResponse = await aiService.sendMessage(prompt, []);

      if (aiResponse) {
        // 尝试解析AI返回的JSON
        try {
          // 检查响应是否已经是JSON对象（如果AI服务直接返回了对象）
          let parsedResponse;
          if (typeof aiResponse === 'object' && aiResponse !== null) {
            parsedResponse = aiResponse;
          } else {
            // 如果是字符串，尝试解析
            let responseStr = aiResponse;
            
            // 尝试从响应中提取JSON部分
            const jsonMatch = responseStr.match(/\{.*\}/s);
            if (jsonMatch) {
              responseStr = jsonMatch[0];
            }
            
            parsedResponse = JSON.parse(responseStr);
          }

          // 检查是否是有效的表格填充结果
          if (parsedResponse && 
              (typeof parsedResponse.success === 'boolean' || 
               parsedResponse.error)) {
            
            // 确保返回的是字符串格式
            return typeof parsedResponse === 'string' ? parsedResponse : JSON.stringify(parsedResponse);
          } else {
            // 如果不是期望的格式，返回错误
            return JSON.stringify({"error": "AI返回格式错误: 请提供正确的参数内容，以便我进行处理。"});
          }
        } catch (e) {
          // 如果不是有效JSON，检查是否包含有用信息
          if (!aiResponse || aiResponse.trim().length === 0) {
            return JSON.stringify({"error": "AI返回空响应"});
          } else {
            // 尝试包装成错误信息
            const errorMessage = `AI返回格式错误: ${aiResponse.replace(/"/g, "'").substring(0, 200)}`;
            return JSON.stringify({"error": errorMessage});
          }
        }
      } else {
        return JSON.stringify({"error": "AI服务调用失败"});
      }
    } catch (e) {
      return JSON.stringify({"error": `填充过程中发生错误: ${e.message || e.toString()}`});
    }
  }
}

module.exports = { TableFiller };