import { inflateRawSync } from "node:zlib"

/**
 * Extrae el primer archivo .csv de un buffer ZIP
 * Parser manual simple de formato ZIP para evitar dependencias externas
 * @param zipBuffer Buffer del archivo ZIP descargado
 * @returns Buffer del CSV extraído
 */
export async function extractFirstCSVFromZip(zipBuffer: Buffer): Promise<Buffer> {
  try {
    // Buscar local file header: 0x04034b50
    let offset = 0
    
    while (offset < zipBuffer.length - 30) {
      // Verificar signature del local file header
      if (zipBuffer.readUInt32LE(offset) === 0x04034b50) {
        // Leer header fields
        const compressionMethod = zipBuffer.readUInt16LE(offset + 8)
        const compressedSize = zipBuffer.readUInt32LE(offset + 18)
        const uncompressedSize = zipBuffer.readUInt32LE(offset + 22)
        const fileNameLength = zipBuffer.readUInt16LE(offset + 26)
        const extraFieldLength = zipBuffer.readUInt16LE(offset + 28)
        
        // Leer nombre del archivo
        const fileName = zipBuffer.toString('utf-8', offset + 30, offset + 30 + fileNameLength)
        
        // Verificar que sea un CSV
        if (fileName.toLowerCase().endsWith('.csv')) {
          console.log(`[v0] Encontrado CSV en ZIP: ${fileName} (${uncompressedSize} bytes)`)
          
          // Offset a los datos comprimidos
          const dataStart = offset + 30 + fileNameLength + extraFieldLength
          const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize)
          
          // Descomprimir según método
          if (compressionMethod === 0) {
            // Sin compresión (stored)
            console.log(`[v0] CSV sin compresión, retornando directamente`)
            return compressedData
          } else if (compressionMethod === 8) {
            // DEFLATE
            console.log(`[v0] Descomprimiendo con DEFLATE...`)
            const decompressed = inflateRawSync(compressedData)
            console.log(`[v0] CSV extraído: ${decompressed.length} bytes`)
            return decompressed
          } else {
            throw new Error(`Método de compresión no soportado: ${compressionMethod}`)
          }
        }
      }
      offset++
    }
    
    throw new Error("No se encontró archivo CSV en el ZIP")
  } catch (error: any) {
    console.error(`[v0] Error en extractFirstCSVFromZip:`, error)
    throw new Error(`Error extrayendo CSV del ZIP: ${error.message}`)
  }
}

/**
 * Detecta si un buffer es un archivo ZIP
 * @param buffer Buffer a verificar
 * @returns true si es ZIP
 */
export function isZipFile(buffer: Buffer): boolean {
  // ZIP files start with PK signature (0x504B0304)
  return buffer.length >= 4 && 
         buffer[0] === 0x50 && 
         buffer[1] === 0x4B &&
         (buffer[2] === 0x03 || buffer[2] === 0x05 || buffer[2] === 0x07) &&
         (buffer[3] === 0x04 || buffer[3] === 0x06 || buffer[3] === 0x08)
}
