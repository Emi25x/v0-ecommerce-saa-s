import Link from "next/link"
import { Package } from "lucide-react"

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 px-3 py-2">
      <Package className="h-6 w-6 text-primary" />
      <span className="text-base font-bold tracking-tight">Nexo Commerce</span>
    </Link>
  )
}
