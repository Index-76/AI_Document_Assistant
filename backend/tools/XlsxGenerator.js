const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');
const fileManagerService = require('../services/fileManagerService');
const loggerService = require('../services/loggerService');

/**
 * XLSX文件生成器类
 * 这个类负责将不同格式的数据（如CSV、JSON）转换成Excel文件(.xlsx)
 */
class XlsxGenerator {
  /**
   * 将AI返回的CSV格式数据转换为XLSX文件并保存
   *
   * 参数:
   * - csvData: 包含表格数据的CSV格式字符串
   * - fileName: 要保存的Excel文件名（不含扩展名）
   *
   * 返回值:
   * - Promise<String>: 生成的Excel文件的完整路径
   *
   * 异常:
   * - Error: 如果生成过程中出现错误则抛出异常
   */
  async generateXlsxFromData(csvData, fileName) {
    try {
      // 解析CSV数据，将其转换为二维字符串数组
      const tableData = this._parseCsvData(csvData);

      // 创建一个新的工作簿
      const workbook = xlsx.utils.book_new();
      
      // 将数据转换为工作表
      const worksheet = xlsx.utils.aoa_to_sheet(tableData);
      
      // 将工作表添加到工作簿
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

      // 获取"结果"目录，这是保存生成文件的位置
      const directory = await fileManagerService.getSectionDirectory('结果');

      // 构建完整的文件路径，文件名为传入的文件名加上.xlsx扩展名
      const filePath = path.join(directory, `${fileName}.xlsx`);
      
      // 保存Excel文件
      xlsx.writeFile(workbook, filePath);

      // 返回生成的文件路径
      return filePath;
    } catch (e) {
      // 如果发生任何错误，抛出带有详细信息的异常
      throw new Error(`Failed to generate XLSX file: ${e.message}`);
    }
  }

  /**
   * 解析CSV格式数据为二维数组
   *
   * 参数:
   * - csvData: CSV格式的字符串数据
   *
   * 返回值:
   * - Array<Array<String>>: 二维字符串数组，表示表格数据
   */
  _parseCsvData(csvData) {
    // 创建存储结果的数组
    const result = [];
    // 按换行符分割数据，得到每一行
    const rows = csvData.split('\n');

    // 遍历每一行数据
    for (const row of rows) {
      // 如果行不为空，则处理该行
      if (row.trim() !== '') {
        // 按逗号分割每行，得到各个列的数据
        let columns = this._parseCSVLine(row);
        // 遍历每个字段，移除可能存在的引号并去除空格
        for (let i = 0; i < columns.length; i++) {
          columns[i] = columns[i].replace(/"/g, '').trim();
        }
        // 将处理好的行数据添加到结果中
        result.push(columns);
      }
    }

    // 返回解析后的二维数组
    return result;
  }

  /**
   * 解析CSV行，处理引号包围的字段
   */
  _parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = i < line.length - 1 ? line[i + 1] : '';

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          // 双引号转义
          current += '"';
          i++; // 跳过下一个引号
        } else {
          // 切换引号状态
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // 遇到逗号且不在引号内，分割字段
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    // 添加最后一个字段
    result.push(current);
    return result;
  }

  /**
   * 检查数据是否可能是表格格式（包含逗号和换行符）
   *
   * 参数:
   * - data: 待检查的字符串数据
   *
   * 返回值:
   * - boolean: 如果数据包含逗号和换行符则返回true，否则返回false
   */
  isTableData(data) {
    // 判断数据中是否同时包含逗号和换行符，这是CSV格式的基本特征
    return data.includes(',') && data.includes('\n');
  }

  /**
   * 检查数据是否为JSON表格格式
   *
   * 参数:
   * - data: 待检查的字符串数据
   *
   * 返回值:
   * - boolean: 如果数据是有效的JSON且符合指定格式则返回true，否则返回false
   *
   * 正确的JSON格式应该如下所示:
   * {
   *   "success": true,
   *   "data": {
   *     "cells": {
   *       "R1C1": "表头1",
   *       "R1C2": "表头2",
   *       "R2C1": "数据1",
   *       "R2C2": "数据2",
   *       ...
   *     }
   *   }
   * }
   */
  isJsonTableData(data) {
    try {
      // 尝试解析JSON数据
      const jsonData = JSON.parse(data);
      // 检查解析后的数据是否为对象并且包含指定的结构
      return typeof jsonData === 'object' &&
          jsonData.success === true &&
          typeof jsonData.data === 'object' &&
          typeof jsonData.data.cells === 'object';
    } catch (e) {
      // 如果解析失败，说明不是有效的JSON格式，返回false
      return false;
    }
  }

  /**
   * 将JSON格式表格数据转换为XLSX文件
   *
   * 参数:
   * - jsonData: 包含表格数据的JSON格式字符串
   * - fileName: 要保存的Excel文件名（不含扩展名）
   *
   * 返回值:
   * - Promise<String>: 生成的Excel文件的完整路径
   *
   * JSON格式应该如下所示:
   * {
   *   "success": true,
   *   "data": {
   *     "cells": {
   *       "R1C1": "表头1",
   *       "R1C2": "表头2",
   *       "R2C1": "数据1",
   *       "R2C2": "数据2",
   *       ...
   *     }
   *   }
   * }
   * 其中RxCy表示第x行第y列（从1开始计数）
   */
  async generateXlsxFromJson(jsonData, fileName) {
    try {
      // 清理JSON数据中的控制字符
      const cleanedJsonData = jsonData
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
          
      // 解析JSON数据，转换为对象
      const response = JSON.parse(cleanedJsonData);
      
      // 检查是否是错误响应
      if (response.success === false) {
        throw new Error(`AI处理失败: ${response.message || '未知错误'}`);
      }
      
      // 获取data部分的数据
      const tableData = response.data;
      // 获取cells部分的数据，这部分包含了所有的单元格数据
      const cells = tableData.cells;

      // 创建一个新的工作簿
      const workbook = xlsx.utils.book_new();
      // 创建一个空工作表
      const worksheet = {};

      // 遍历所有单元格数据
      Object.entries(cells).forEach(([key, value]) => {
        // 定义正则表达式来匹配RxCy格式的坐标（如R1C2表示第1行第2列）
        const regExp = /R(\d+)C(\d+)/;
        // 在当前键中查找匹配项
        const match = regExp.exec(key);

        // 如果找到匹配项
        if (match) {
          // 提取行号（第一个捕获组）和列号（第二个捕获组）
          const row = parseInt(match[1]);
          const col = parseInt(match[2]);
          
          // Excel中列用字母表示，A=1, B=2, C=3...
          const colName = this._numberToColumnName(col);
          const cellAddress = `${colName}${row}`;
          
          // 在对应位置设置单元格的值
          worksheet[cellAddress] = { v: value.toString() };
        }
      });

      // 更新工作表范围以包含所有数据
      if (Object.keys(worksheet).length > 0) {
        const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1');
        Object.keys(worksheet).forEach(key => {
          if (key[0] !== '!') { // 跳过特殊属性
            const cell = xlsx.utils.decode_cell(key);
            if (cell.r > range.e.r) range.e.r = cell.r;
            if (cell.c > range.e.c) range.e.c = cell.c;
          }
        });
        worksheet['!ref'] = xlsx.utils.encode_range(range);
      }

      // 将工作表添加到工作簿
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

      // 获取"结果"目录，这是保存生成文件的位置
      const resultDirectory = await fileManagerService.getSectionDirectory('结果');

      // 构建完整的文件路径，文件名为传入的文件名加上.xlsx扩展名
      const resultFilePath = path.join(resultDirectory, `${fileName}.xlsx`);
      
      // 保存Excel文件
      xlsx.writeFile(workbook, resultFilePath);

      // 返回生成的文件路径
      return resultFilePath;
    } catch (e) {
      // 如果发生任何错误，抛出带有详细信息的异常
      throw new Error(`Failed to generate XLSX file from JSON: ${e.message}. Original JSON: ${jsonData}`);
    }
  }
  
  /**
   * 将数字转换为Excel列名（如1->A, 2->B, 27->AA等）
   */
  _numberToColumnName(num) {
    let result = '';
    while (num > 0) {
      num--; // 从0开始计数
      result = String.fromCharCode(65 + (num % 26)) + result;
      num = Math.floor(num / 26);
    }
    return result;
  }
  
  /**
   * 将JSON格式表格数据转换为XLSX文件（带冲突解决）
   *
   * 参数:
   * - jsonData: 包含表格数据的JSON格式字符串
   * - fileName: 要保存的Excel文件名（不含扩展名）
   *
   * 返回值:
   * - Promise<String>: 生成的Excel文件的完整路径
   */
  async generateXlsxFromJsonWithConflictResolution(jsonData, fileName) {
    try {
      // 清理JSON数据中的控制字符
      let cleanedJsonData = jsonData
          .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
          
      // 解析JSON数据，转换为对象
      const response = JSON.parse(cleanedJsonData);
      
      // 检查是否是错误响应
      if (response.success === false) {
        throw new Error(`AI处理失败: ${response.message || '未知错误'}`);
      }
      
      // 获取data部分的数据
      const tableData = response.data;
      // 获取cells部分的数据，这部分包含了所有的单元格数据
      const cells = tableData.cells;

      // 创建一个新的工作簿
      const workbook = xlsx.utils.book_new();
      // 创建一个空工作表
      const worksheet = {};

      // 遍历所有单元格数据
      Object.entries(cells).forEach(([key, value]) => {
        // 定义正则表达式来匹配RxCy格式的坐标（如R1C2表示第1行第2列）
        const regExp = /R(\d+)C(\d+)/;
        // 在当前键中查找匹配项
        const match = regExp.exec(key);

        // 如果找到匹配项
        if (match) {
          // 提取行号（第一个捕获组）和列号（第二个捕获组）
          const row = parseInt(match[1]);
          const col = parseInt(match[2]);
          
          // Excel中列用字母表示，A=1, B=2, C=3...
          const colName = this._numberToColumnName(col);
          const cellAddress = `${colName}${row}`;
          
          // 在对应位置设置单元格的值
          worksheet[cellAddress] = { v: value.toString() };
        }
      });

      // 更新工作表范围以包含所有数据
      if (Object.keys(worksheet).length > 0) {
        const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1');
        Object.keys(worksheet).forEach(key => {
          if (key[0] !== '!') { // 跳过特殊属性
            const cell = xlsx.utils.decode_cell(key);
            if (cell.r > range.e.r) range.e.r = cell.r;
            if (cell.c > range.e.c) range.e.c = cell.c;
          }
        });
        worksheet['!ref'] = xlsx.utils.encode_range(range);
      }

      // 将工作表添加到工作簿
      xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

      // 获取"结果"目录，这是保存生成文件的位置
      const resultDirectory = await fileManagerService.getSectionDirectory('结果');
      
      // 处理文件名冲突
      let finalFileName = fileName;
      let counter = 2;
      let resultFilePath = path.join(resultDirectory, `${finalFileName}.xlsx`);
      
      while (fs.existsSync(resultFilePath)) {
        finalFileName = `${fileName}(${counter})`;
        resultFilePath = path.join(resultDirectory, `${finalFileName}.xlsx`);
        counter++;
      }

      // 保存Excel文件
      xlsx.writeFile(workbook, resultFilePath);

      // 返回生成的文件路径
      return resultFilePath;
    } catch (e) {
      // 如果发生任何错误，抛出带有详细信息的异常
      throw new Error(`Failed to generate XLSX file from JSON: ${e.message}. Original JSON: ${jsonData}`);
    }
  }

  /**
   * 从JSON文件读取数据并生成XLSX文件
   *
   * 参数:
   * - jsonFilePath: JSON文件的完整路径
   * - fileName: 要保存的Excel文件名（不含扩展名）
   *
   * 返回值:
   * - Promise<String>: 生成的Excel文件的完整路径
   */
  async generateXlsxFromJsonFile(jsonFilePath, fileName) {
    try {
      // 读取JSON文件内容
      const jsonString = fs.readFileSync(jsonFilePath, 'utf-8');

      // 调用现有的generateXlsxFromJson方法处理数据
      return await this.generateXlsxFromJson(jsonString, fileName);
    } catch (e) {
      // 如果发生任何错误，抛出带有详细信息的异常
      throw new Error(`Failed to generate XLSX file from JSON file: ${e.message}`);
    }
  }
}

module.exports = { XlsxGenerator };