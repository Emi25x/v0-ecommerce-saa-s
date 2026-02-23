import { unzipSync } from "node:zlib"
import { parse as parsePath } from "node:path"

/**
 * Extrae el primer archivo .csv de un buffer ZIP
 * Usa implementación simple con unzipSync - asume ZIP con un solo archivo
 * @param zipBuffer Buffer del archivo ZIP descargado
 * @returns Buffer del CSV extraído
 */
export async function extractFirstCSVFromZip(zipBuffer: Buffer): Promise<Buffer> {
  try {
    // Intentar descomprimir directamente (funciona para ZIPs simples con deflate)
    // NOTA: Esta es una implementación simplificada que asume el CSV es el contenido principal
    // Para ZIPs más complejos, necesitaríamos una librería de parsing completo
    
    // Buscar inicio de datos comprimidos en el archivo ZIP
    // ZIP format: local file header (30 bytes min) + file name + extra + compressed data
    let offset = 0
    
    // Buscar signature del local file header: 0x04034b50
    while (offset < zipBuffer.length - 4) {
      if (zipBuffer[offset] === 0x50 && 
          zipBuffer[offset + 1] === 0x4B &&
          zipBuffer[offset + 2] === 0x03 &&
          zipBuffer[offset + 3] === 0x04) {
        
        // Encontrado header, leer offsets
        const fileNameLength = zipBuffer.readUInt16LE(offset + 26)
        const extraFieldLength = zipBuffer.readUInt16LE(offset + 28)
        const compressedSize = zipBuffer.readUInt32LE(offset + 18)
        
        // Offset a datos comprimidos
        const dataOffset = offset + 30 + fileNameLength + extraFieldLength
        const compressedData = zipBuffer.subarray(dataOffset, dataOffset + compressedSize)
        
        // Descomprimir usando deflate
        const decompressed = unzipSync(compressedData)
        console.log(`[v0] CSV extraído del ZIP: ${decompressed.length} bytes`)
        return decompressed
      }
      offset++
    }
    
    throw new Error("No se pudo encontrar datos comprimidos en el ZIP")
  } catch (error: any) {
    throw new Error(`Error al extraer CSV del ZIP: ${error.message}`)
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
