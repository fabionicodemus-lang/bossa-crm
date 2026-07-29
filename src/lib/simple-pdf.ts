import { Buffer } from 'node:buffer';

export type ProposalPdfImage = {
  bytes: Buffer;
  width: number;
  height: number;
};

export type ProposalPdfScheduleRow = {
  label: string;
  quantity: string;
  amount: string;
  firstDue: string;
  total: string;
};

export type ProposalPdfData = {
  proposalNumber: string;
  proposalDate: string;
  validity: string;
  clientName: string;
  originLabel: string;
  leadName: string;
  developmentName: string;
  unitCode: string;
  deliveryDate: string;
  responsibleName: string;
  listPrice: string;
  proposedPrice: string;
  discount: string;
  paidUntilKeys: string;
  schedule: ProposalPdfScheduleRow[];
  notes: string;
  bossaLogo: ProposalPdfImage;
  developmentLogo?: ProposalPdfImage | null;
};

const WIN_1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85,
  0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a,
  0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92,
  0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
  0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c,
  0x017e: 0x9e, 0x0178: 0x9f,
};

function winAnsiBytes(text: string) {
  const bytes: number[] = [];
  for (const character of text.normalize('NFC')) {
    const code = character.codePointAt(0) ?? 63;
    if (code <= 255) bytes.push(code);
    else bytes.push(WIN_1252[code] ?? 63);
  }
  return Buffer.from(bytes);
}

function textHex(text: string) {
  return winAnsiBytes(text).toString('hex').toUpperCase();
}

function formatNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

export function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 8 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset++; continue; }
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) break;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) break;
    const isSof = [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker);
    if (isSof && length >= 7) {
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += length;
  }
  return null;
}

function wrap(text: string, maxChars: number) {
  const paragraphs = text.replace(/\r/g, '').split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let current = '';
    for (const word of words) {
      if (!current) current = word;
      else if (`${current} ${word}`.length <= maxChars) current += ` ${word}`;
      else { lines.push(current); current = word; }
    }
    if (current) lines.push(current);
  }
  return lines;
}

function imageObject(image: ProposalPdfImage) {
  const header = Buffer.from(`<< /Type /XObject /Subtype /Image /Width ${image.width} /Height ${image.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.bytes.length} >>\nstream\n`, 'binary');
  return Buffer.concat([header, image.bytes, Buffer.from('\nendstream', 'binary')]);
}

function pdfDocument(objects: Buffer[]) {
  const header = Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'binary');
  const pieces: Buffer[] = [header];
  const offsets = [0];
  let cursor = header.length;
  objects.forEach((object, index) => {
    offsets[index + 1] = cursor;
    const prefix = Buffer.from(`${index + 1} 0 obj\n`, 'binary');
    const suffix = Buffer.from('\nendobj\n', 'binary');
    pieces.push(prefix, object, suffix);
    cursor += prefix.length + object.length + suffix.length;
  });
  const xrefOffset = cursor;
  const xrefLines = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n'];
  for (let index = 1; index <= objects.length; index++) {
    xrefLines.push(`${String(offsets[index]).padStart(10, '0')} 00000 n \n`);
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  pieces.push(Buffer.from(xrefLines.join('') + trailer, 'binary'));
  return Buffer.concat(pieces);
}

export function createProposalPdf(data: ProposalPdfData) {
  const width = 595.28;
  const height = 841.89;
  const orange = '0.835 0.302 0.110';
  const dark = '0.145 0.125 0.110';
  const gray = '0.43 0.40 0.37';
  const light = '0.965 0.955 0.945';
  const line = '0.86 0.84 0.81';
  const commands: string[] = [];

  const topY = (top: number) => height - top;
  const drawText = (text: string, x: number, top: number, size = 10, bold = false, color = dark) => {
    commands.push(`BT /${bold ? 'F2' : 'F1'} ${formatNumber(size)} Tf ${color} rg ${formatNumber(x)} ${formatNumber(topY(top))} Td <${textHex(text)}> Tj ET`);
  };
  const drawLine = (x1: number, top1: number, x2: number, top2: number, stroke = line, thickness = 0.7) => {
    commands.push(`${stroke} RG ${formatNumber(thickness)} w ${formatNumber(x1)} ${formatNumber(topY(top1))} m ${formatNumber(x2)} ${formatNumber(topY(top2))} l S`);
  };
  const drawRect = (x: number, top: number, w: number, h: number, fill: string) => {
    commands.push(`${fill} rg ${formatNumber(x)} ${formatNumber(topY(top + h))} ${formatNumber(w)} ${formatNumber(h)} re f`);
  };
  const drawImage = (name: string, image: ProposalPdfImage, x: number, top: number, maxW: number, maxH: number) => {
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = image.width * scale;
    const h = image.height * scale;
    const y = topY(top + h);
    commands.push(`q ${formatNumber(w)} 0 0 ${formatNumber(h)} ${formatNumber(x)} ${formatNumber(y)} cm /${name} Do Q`);
  };

  drawRect(0, 0, width, 11, orange);
  drawImage('ImBossa', data.bossaLogo, 40, 30, 190, 65);
  if (data.developmentLogo) drawImage('ImDev', data.developmentLogo, 398, 28, 157, 70);
  else drawText(data.developmentName, 390, 56, 13, true, orange);
  drawLine(40, 104, 555, 104, orange, 1.4);

  drawText('PROPOSTA COMERCIAL', 40, 136, 20, true, dark);
  drawText(`Proposta #${data.proposalNumber}`, 430, 132, 10, true, orange);
  drawText(`Emissão: ${data.proposalDate}`, 430, 149, 8.5, false, gray);
  drawText(`Validade: ${data.validity}`, 430, 164, 8.5, false, gray);

  drawRect(40, 184, 515, 90, light);
  drawText('CLIENTE E EMPREENDIMENTO', 54, 204, 8.5, true, orange);
  drawText(data.clientName || '—', 54, 226, 13, true, dark);
  drawText(data.originLabel, 54, 244, 8.5, false, gray);
  if (data.leadName && data.leadName !== data.clientName) drawText(`Contato de origem: ${data.leadName}`, 54, 260, 8.5, false, gray);
  drawText(data.developmentName, 320, 226, 12, true, dark);
  drawText(data.unitCode ? `Unidade ${data.unitCode}` : 'Unidade a definir', 320, 244, 9, false, gray);
  drawText(`Entrega prevista: ${data.deliveryDate}`, 320, 260, 8.5, false, gray);

  drawText('RESUMO FINANCEIRO', 40, 302, 9, true, orange);
  const summary = [
    ['Valor de tabela', data.listPrice],
    ['Valor da proposta', data.proposedPrice],
    ['Desconto', data.discount],
    ['Pago até as chaves', data.paidUntilKeys],
  ];
  const cardW = 125;
  summary.forEach(([labelText, value], index) => {
    const x = 40 + index * (cardW + 5);
    drawRect(x, 316, cardW, 58, index === 1 ? '0.987 0.944 0.920' : light);
    drawText(labelText, x + 9, 333, 7.1, false, gray);
    drawText(value, x + 9, 357, index === 1 ? 10.5 : 9.1, true, index === 1 ? orange : dark);
  });

  drawText('FLUXO DE PAGAMENTO', 40, 407, 9, true, orange);
  drawRect(40, 421, 515, 25, dark);
  const columns = [40, 250, 305, 382, 465, 555];
  const headers = ['Pagamento', 'Qtd.', 'Valor', '1º vencimento', 'Total'];
  headers.forEach((headerText, index) => drawText(headerText, columns[index] + 7, 438, 7.5, true, '1 1 1'));

  let rowTop = 446;
  const schedule = data.schedule.length ? data.schedule : [{ label: 'Fluxo não informado', quantity: '—', amount: '—', firstDue: '—', total: '—' }];
  schedule.slice(0, 7).forEach((row, index) => {
    if (index % 2 === 0) drawRect(40, rowTop, 515, 31, light);
    drawText(row.label, 47, rowTop + 19, 8.5, index === 0, dark);
    drawText(row.quantity, 257, rowTop + 19, 8.5, false, dark);
    drawText(row.amount, 312, rowTop + 19, 8.5, false, dark);
    drawText(row.firstDue, 389, rowTop + 19, 8.2, false, dark);
    drawText(row.total, 472, rowTop + 19, 8.5, true, dark);
    drawLine(40, rowTop + 31, 555, rowTop + 31, line, 0.5);
    rowTop += 31;
  });

  const notesTop = Math.max(681, rowTop + 25);
  drawText('CONDIÇÕES E OBSERVAÇÕES', 40, notesTop, 9, true, orange);
  const noteLines = wrap(data.notes || 'Condições conforme fluxo apresentado. Valores sujeitos à confirmação e à disponibilidade da unidade.', 94).slice(0, 6);
  noteLines.forEach((note, index) => drawText(note, 40, notesTop + 20 + index * 13, 8.3, false, gray));

  drawLine(40, 786, 555, 786, line, 0.7);
  drawText(`Responsável: ${data.responsibleName}`, 40, 805, 8, false, gray);
  drawText('Bossa Empreendimentos · Construir com Bossa', 335, 805, 8, true, orange);
  drawText('Este documento representa uma simulação comercial e não substitui o contrato de compra e venda.', 40, 822, 6.8, false, gray);

  const content = Buffer.from(commands.join('\n'), 'binary');
  const hasDevelopmentLogo = Boolean(data.developmentLogo);
  const resources = `<< /Font << /F1 4 0 R /F2 5 0 R >> /XObject << /ImBossa 7 0 R${hasDevelopmentLogo ? ' /ImDev 8 0 R' : ''} >> >>`;
  const objects: Buffer[] = [
    Buffer.from('<< /Type /Catalog /Pages 2 0 R >>', 'binary'),
    Buffer.from('<< /Type /Pages /Kids [3 0 R] /Count 1 >>', 'binary'),
    Buffer.from(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources ${resources} /Contents 6 0 R >>`, 'binary'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>', 'binary'),
    Buffer.from('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>', 'binary'),
    Buffer.concat([Buffer.from(`<< /Length ${content.length} >>\nstream\n`, 'binary'), content, Buffer.from('\nendstream', 'binary')]),
    imageObject(data.bossaLogo),
  ];
  if (data.developmentLogo) objects.push(imageObject(data.developmentLogo));
  return pdfDocument(objects);
}
