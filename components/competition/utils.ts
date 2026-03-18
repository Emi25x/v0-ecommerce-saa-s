export const getCompetitionIcon = (status: string) => {
  switch (status) {
    case "winning":
      return "\u{1F3C6}"
    case "sharing_first_place":
      return "\u{1F91D}"
    case "competing":
      return "\u2694\uFE0F"
    case "losing":
      return "\u274C"
    case "listed":
      return "\u{1F4CB}"
    case "penalized":
      return "\u26A0\uFE0F"
    default:
      return "\u2753"
  }
}

export const getCompetitionStatusColor = (status: string) => {
  switch (status) {
    case "winning":
      return "bg-green-100 text-green-800 border-green-300"
    case "sharing_first_place":
      return "bg-blue-100 text-blue-800 border-blue-300"
    case "competing":
      return "bg-yellow-100 text-yellow-800 border-yellow-300"
    case "losing":
      return "bg-red-100 text-red-800 border-red-300"
    case "listed":
      return "bg-gray-100 text-gray-800 border-gray-300"
    case "penalized":
      return "bg-orange-100 text-orange-800 border-orange-300"
    default:
      return "bg-gray-100 text-gray-800 border-gray-300"
  }
}

export const getCompetitionStatusText = (status: string) => {
  switch (status) {
    case "winning":
      return "Ganando"
    case "sharing_first_place":
      return "Compartiendo 1\u00B0"
    case "competing":
      return "Compitiendo"
    case "losing":
      return "Perdiendo"
    case "listed":
      return "Listado"
    case "penalized":
      return "Penalizado"
    default:
      return status
  }
}

export const getCompetitionExplanation = (status: string) => {
  switch (status) {
    case "winning":
      return "Tu publicaci\u00F3n aparece primero en la p\u00E1gina del producto. \u00A1Excelente!"
    case "sharing_first_place":
      return "Compartes la primera posici\u00F3n con otros vendedores."
    case "competing":
      return "Est\u00E1s compitiendo activamente por la primera posici\u00F3n."
    case "losing":
      return "Otra publicaci\u00F3n aparece primero. Revisa las oportunidades para mejorar."
    case "listed":
      return "Tu publicaci\u00F3n est\u00E1 en el cat\u00E1logo pero no hay competencia activa."
    case "penalized":
      return "Tu publicaci\u00F3n no puede competir debido a penalizaciones."
    default:
      return "Estado desconocido"
  }
}

export const getBoostIcon = (type: string) => {
  switch (type) {
    case "free_shipping":
      return "\u{1F69A}"
    case "installments":
      return "\u{1F4B3}"
    case "same_day_shipping":
      return "\u26A1"
    case "full_shipping":
      return "\u{1F4E6}"
    case "price":
      return "\u{1F4B0}"
    default:
      return "\u2728"
  }
}

export const getBoostText = (type: string) => {
  switch (type) {
    case "free_shipping":
      return "Env\u00EDo Gratis"
    case "installments":
      return "Cuotas sin Inter\u00E9s"
    case "same_day_shipping":
      return "Env\u00EDo el Mismo D\u00EDa"
    case "full_shipping":
      return "Env\u00EDo Full"
    case "price":
      return "Precio Competitivo"
    default:
      return type
  }
}
