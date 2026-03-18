"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { ValidationResults } from "@/components/inventory/types"

interface ValidationDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  validating: boolean
  validationResults: ValidationResults | null
}

export function ValidationDialog({
  open,
  onOpenChange,
  validating,
  validationResults,
}: ValidationDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Validaci&oacute;n de Importaci&oacute;n</DialogTitle>
        </DialogHeader>
        {validating ? (
          <div className="text-center py-8">Validando configuraci&oacute;n...</div>
        ) : validationResults ? (
          <div className="space-y-4">
            {validationResults.errors && validationResults.errors.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-red-600 dark:text-red-400">Errores:</h3>
                <ul className="list-disc list-inside space-y-1">
                  {validationResults.errors.map((error, i) => (
                    <li key={i} className="text-red-600 dark:text-red-400">
                      {error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {validationResults.warnings && validationResults.warnings.length > 0 && (
              <div className="space-y-2">
                <h3 className="font-semibold text-yellow-600 dark:text-yellow-400">Advertencias:</h3>
                <ul className="list-disc list-inside space-y-1">
                  {validationResults.warnings.map((warning, i) => (
                    <li key={i} className="text-yellow-600 dark:text-yellow-400">
                      {warning}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
