import AdmZip from "adm-zip"

/**
 * Extrae el primer archivo .csv de un buffer ZIP
 * @param zipBuffer Buffer del archivo ZIP descargado
 * @returns Buffer del CSV extraído
 */
export async function extractFirstCSVFromZip(zipBuffer: Buffer): Promise<Buffer> {
  try {
    const zip = new AdmZip(zipBuffer)
    const zipEntries = zip.getEntries()
    
    // Buscar el primer archivo .csv (case-insensitive)
    const csvEntry = zipEntries.find(entry => 
      !entry.isDirectory && 
      entry.entryName.toLowerCase().endsWith('.csv')
    )
    
    if (!csvEntry) {
      throw new Error("No se encontró ningún archivo .csv dentro del ZIP")
    }
    
    console.log(`[v0] Extrayendo ${csvEntry.entryName} del ZIP (${csvEntry.header.size} bytes)`)
    
    return csvEntry.getData()
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
