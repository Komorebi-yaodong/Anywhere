function parseExcelBase64(base64Data) {
    const XLSX = require('xlsx/dist/xlsx.mini.min.js');
    const s = base64Data.split(',')[1];
    if (!s) throw new Error("Invalid base64 data for Excel file");

    const buffer = Buffer.from(s, 'base64');
    const workbook = XLSX.read(buffer, { type: 'buffer' });

    let fullTextContent = '';
    workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        const csvData = XLSX.utils.sheet_to_csv(worksheet);
        fullTextContent += `--- Sheet: ${sheetName} ---\n${csvData}\n\n`;
    });
    return fullTextContent.trim();
}

module.exports = {
    parseExcelBase64,
};
