const aiService = require('../services/aiService');

/**
 * 表格分析工具类
 * 用于分析纯文本格式的Excel数据，识别表头和表格方向
 */
class TableAnalyzer {
  /**
   * 分析表格文本内容，识别表头和格式方向
   *
   * 参数:
   * - tableText: 用户提供的纯文本格式的Excel数据
   *
   * 返回:
   * - 成功时返回包含表头和格式的JSON字符串
   * - 失败时返回错误信息
   */
  static async analyzeTableHeaders(tableText) {
    // 检查tableText是否为undefined或null或未定义
    if (tableText === undefined || tableText === null || typeof tableText === 'undefined') {
      return JSON.stringify({"error": "输入的表格文本内容为空或未定义"});
    }

    // 构造给AI的完整提示词
    const prompt = `
你是一个数据整理助手。请严格按以下要求处理：

输入：用户提供纯文本格式的Excel数据

处理要求：
分析表头：识别表格的表头内容（哪些是列名/行名）
判断方向：判断表格是横向布局（表头在第一行）还是纵向布局（表头在第一列）

识别规则：
表头识别逻辑
横向表头特征：第一行（或前几行）包含描述性字段名，后续行是具体数据
纵向表头特征：第一列（或前几列）包含描述性字段名，后续列是具体数据
表头内容特点：通常是名词或短语（如"姓名"、"年龄"、"部门"），而不是具体数值或日期

方向判断逻辑
1.优先检查第一行：
如果第一行大部分内容是字段描述，且下方行是数据 → "horizontal"
2.如果不是横向，检查第一列：
如果第一列大部分内容是字段描述，且右侧列是数据 → "vertical"
3.特殊情况：
如果两者都符合，选择"horizontal"
如果无法确定，默认"horizontal"

输出格式，仅为json格式，不得使用代码块：
成功识别时：
{
  "table": {
    "columns": ["字段1", "字段2", "字段3", ...],
    "format": "horizontal" // 或 "vertical"
  }
}
识别失败时：
{
  "error": "文本格式错误：未检测到有效表头"
}

以下是用户提供的表格文本内容： 
${tableText}
`;

    try {
      // 调用AI服务分析表格
      const aiResponse = await aiService.sendMessage(prompt, []);

      if (aiResponse) {
        // 尝试解析AI返回的JSON
        try {
          // 验证返回内容是否为有效的JSON
          const decodedJson = JSON.parse(aiResponse);

          // 检查是否是有效的表格分析结果
          if (typeof decodedJson === 'object' &&
              (decodedJson.table || decodedJson.error)) {
            // 如果返回了错误，但文本看起来像是有表头的，则尝试使用简单的默认处理
            if (decodedJson.error && tableText.trim() !== '') {
              // 尝试从文本中简单提取表头
              return this._trySimpleHeaderExtraction(tableText);
            }
            return JSON.stringify(decodedJson);
          } else {
            // 如果不是期望的格式，尝试简单提取
            if (tableText.trim() !== '') {
              return this._trySimpleHeaderExtraction(tableText);
            }
            return JSON.stringify({"error": "AI返回格式错误: 请提供用户提供的表格文本内容，以便我进行分析和处理。"});
          }
        } catch (e) {
          // 如果不是有效JSON，检查是否包含有用信息
          if (!aiResponse || aiResponse.trim().length === 0) {
            return JSON.stringify({"error": "AI返回空响应"});
          } else if (aiResponse.includes("请提供") &&
              aiResponse.includes("内容")) {
            // AI在请求更多内容，这表示分析失败
            // 尝试简单提取表头
            if (tableText.trim() !== '') {
              return this._trySimpleHeaderExtraction(tableText);
            }
            return JSON.stringify({"error": "AI返回格式错误: 请提供用户提供的表格文本内容，以便我进行分析和处理。"});
          } else {
            // 尝试简单提取表头
            if (tableText.trim() !== '') {
              return this._trySimpleHeaderExtraction(tableText);
            }
            // 尝试包装成错误信息
            return JSON.stringify({"error": `AI返回格式错误: ${aiResponse.replace(/"/g, '')}`});
          }
        }
      } else {
        // AI服务调用失败，尝试简单提取
        if (tableText.trim() !== '') {
          return this._trySimpleHeaderExtraction(tableText);
        }
        return JSON.stringify({"error": "AI服务调用失败"});
      }
    } catch (e) {
      // 出现异常，尝试简单提取
      if (tableText.trim() !== '') {
        return this._trySimpleHeaderExtraction(tableText);
      }
      return JSON.stringify({"error": `分析过程中发生错误: ${e.message || e.toString()}`});
    }
  }

  /**
   * 尝试简单提取表头的备用方法
   */
  static _trySimpleHeaderExtraction(tableText) {
    try {
      const trimmedText = tableText.trim();
      if (trimmedText === '') {
        return JSON.stringify({"error": "文本为空"});
      }

      // 简单按逗号分割第一行作为表头
      const lines = trimmedText.split('\n');
      if (lines.length === 0) {
        return JSON.stringify({"error": "文本格式错误"});
      }

      const firstLine = lines[0].trim();
      if (firstLine === '') {
        return JSON.stringify({"error": "首行为空"});
      }

      // 按逗号分割
      let headers = firstLine.split(',');
      // 清理每个表头项
      headers = headers.map(header => header.trim()).filter(header => header !== '');

      if (headers.length === 0) {
        // 尝试按制表符分割
        headers = firstLine.split('\t');
        headers = headers.map(header => header.trim()).filter(header => header !== '');
      }

      if (headers.length > 0) {
        return JSON.stringify({
          table: {
            columns: headers,
            format: "horizontal"
          }
        });
      } else {
        return JSON.stringify({"error": "无法提取有效表头"});
      }
    } catch (e) {
      return JSON.stringify({"error": `简单提取失败: ${e.message || e.toString()}`});
    }
  }
}

module.exports = { TableAnalyzer };