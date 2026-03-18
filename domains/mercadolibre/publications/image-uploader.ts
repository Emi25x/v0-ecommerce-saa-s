/**
 * Image upload logic for MercadoLibre publications.
 * Handles downloading product images, uploading to ML via multipart/form-data,
 * and generating fallback images when needed.
 */

import { generateFallbackImage } from "@/domains/mercadolibre/publications/fallback-image"

export interface ImageUploadResult {
  id: string | null
  error?: string
}

/**
 * Downloads an image from a URL and uploads it to ML using multipart/form-data.
 * This avoids Cloudflare issues by uploading the binary directly to ML.
 * ML requires minimum 500px on one side.
 */
export async function uploadImageToML(
  imageUrl: string,
  accessToken: string
): Promise<ImageUploadResult> {
  try {
    // Descargar imagen con headers de navegador (timeout 10s)
    const response = await fetch(imageUrl, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
      }
    })

    if (!response.ok) {
      return { id: null, error: `No se pudo descargar la imagen (${response.status})` }
    }

    const contentType = response.headers.get("content-type") || ""
    if (contentType.includes("text/html")) {
      return { id: null, error: "La URL de imagen está bloqueada por Cloudflare" }
    }

    const imageBuffer = await response.arrayBuffer()
    if (imageBuffer.byteLength < 1000) {
      return { id: null, error: "La imagen es muy pequeña (menos de 1KB)" }
    }

    // Crear FormData para multipart upload
    const formData = new FormData()
    const blob = new Blob([imageBuffer], { type: contentType || "image/jpeg" })
    formData.append("file", blob, "image.jpg")

    // Subir a ML usando multipart/form-data
    const uploadResponse = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${accessToken}`,
      },
      body: formData,
    })

    if (!uploadResponse.ok) {
      const errorData = await uploadResponse.json().catch(() => ({ message: "Error desconocido" }))
      // ML devuelve error específico si la imagen es menor a 500px
      if (errorData.message?.includes("500 píxeles")) {
        return { id: null, error: "imagen_pequena" }
      }
      return { id: null, error: errorData.message || "Error al subir imagen a ML" }
    }

    const uploadData = await uploadResponse.json()
    return { id: uploadData.id }
  } catch (error) {
    return { id: null, error: `Error: ${error}` }
  }
}

/**
 * Generates and uploads the Libroide fallback image to ML.
 * Used when the product has no image or the image is too small (<500px).
 */
export async function uploadFallbackImageToML(accessToken: string): Promise<string | null> {
  try {
    // Generar la imagen fallback directamente (sin self-fetch)
    const imageBuffer = await generateFallbackImage()

    const formData = new FormData()
    const blob = new Blob([imageBuffer], { type: "image/png" })
    formData.append("file", blob, "libroide-fallback.png")

    const uploadResponse = await fetch("https://api.mercadolibre.com/pictures/items/upload", {
      method: "POST",
      headers: { "Authorization": `Bearer ${accessToken}` },
      body: formData,
    })

    if (!uploadResponse.ok) {
      console.log("[v0] Failed to upload fallback image to ML")
      return null
    }

    const uploadData = await uploadResponse.json()
    console.log("[v0] Fallback image uploaded to ML:", uploadData.id)
    return uploadData.id
  } catch (error) {
    console.log("[v0] Error uploading fallback image:", error)
    return null
  }
}

/**
 * Resolves the ML picture ID for a product.
 * Tries the product's image_url first, falls back to Libroide image if needed.
 * Returns the picture ID and any warning message.
 */
export async function resolveProductImage(
  imageUrl: string | null | undefined,
  accessToken: string
): Promise<{ mlPictureId: string | null; imageWarning: string | null }> {
  let mlPictureId: string | null = null
  let imageWarning: string | null = null

  if (imageUrl) {
    const uploadResult = await uploadImageToML(imageUrl, accessToken)
    mlPictureId = uploadResult.id

    // Si la imagen es muy pequeña, usar imagen fallback de Libroide
    if (uploadResult.error === "imagen_pequena") {
      console.log("[v0] Image too small, using Libroide fallback image")
      mlPictureId = await uploadFallbackImageToML(accessToken)
      imageWarning = "Imagen original muy pequeña. Se usó imagen de Libroide."
    } else if (uploadResult.error) {
      imageWarning = uploadResult.error
    }
  } else {
    // Sin imagen original, usar fallback
    console.log("[v0] No image URL, using Libroide fallback image")
    mlPictureId = await uploadFallbackImageToML(accessToken)
    imageWarning = "Sin imagen original. Se usó imagen de Libroide."
  }

  return { mlPictureId, imageWarning }
}
