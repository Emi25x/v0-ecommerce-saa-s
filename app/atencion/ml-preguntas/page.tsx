"use client"

import { useEffect, useState, useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  RefreshCw,
  Search,
  Send,
  ShoppingBag,
  Clock,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

interface Conversation {
  id: string
  external_id: string | null
  customer_name: string | null
  customer_id: string | null
  subject: string | null
  product_title: string | null
  status: string
  unread_count: number
  last_message_at: string
}

interface Message {
  id: string
  direction: "inbound" | "outbound"
  author_name: string | null
  content: string
  created_at: string
}

interface Template {
  id: string
  name: string
  body: string
}

export default function MLPreguntasPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading]             = useState(false)
  const [syncing, setSyncing]             = useState(false)
  const [searchQ, setSearchQ]             = useState("")
  const [statusFilter, setStatusFilter]   = useState("pending_reply")

  const [selected, setSelected]           = useState<Conversation | null>(null)
  const [messages, setMessages]           = useState<Message[]>([])
  const [templates, setTemplates]         = useState<Template[]>([])
  const [replyText, setReplyText]         = useState("")
  const [sending, setSending]             = useState(false)
  const [sendError, setSendError]         = useState<string | null>(null)
  const [loadingMessages, setLoadingMessages] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ channel: "ml_question", limit: "100" })
      if (statusFilter !== "all") params.set("status", statusFilter)
      if (searchQ.trim()) params.set("q", searchQ.trim())
      const res = await fetch(`/api/cs/conversations?${params}`)
      const data = await res.json()
      setConversations(data.conversations ?? [])
    } finally {
      setLoading(false)
    }
  }, [statusFilter, searchQ])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    fetch("/api/cs/templates?category=ml_question")
      .then(r => r.json())
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => {})
  }, [])

  const sync = async () => {
    setSyncing(true)
    try {
      await fetch("/api/cs/ml-questions?sync=1")
      await load()
    } finally {
      setSyncing(false)
    }
  }

  const openConversation = async (conv: Conversation) => {
    setSelected(conv)
    setSendError(null)
    setReplyText("")
    setLoadingMessages(true)
    try {
      const res = await fetch(`/api/cs/conversations/${conv.id}`)
      const data = await res.json()
      setMessages(data.messages ?? [])
      setSelected(data.conversation ?? conv)
      load()
    } finally {
      setLoadingMessages(false)
    }
  }

  const sendReply = async () => {
    if (!selected || !replyText.trim()) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/cs/conversations/${selected.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim() }),
      })
      const data = await res.json()
      if (data.channel_error) setSendError(data.warning ?? data.channel_error)
      setReplyText("")
      // Reload messages and list
      const convRes = await fetch(`/api/cs/conversations/${selected.id}`)
      const convData = await convRes.json()
      setMessages(convData.messages ?? [])
      setSelected(convData.conversation ?? selected)
      load()
    } catch (err: any) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  const pendingCount = conversations.filter(c => c.status === "pending_reply").length

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <ShoppingBag className="h-5 w-5" />
            Preguntas MercadoLibre
          </h1>
          {pendingCount > 0 && (
            <p className="text-sm text-amber-600 dark:text-amber-400 font-medium">
              {pendingCount} pregunta{pendingCount !== 1 ? "s" : ""} sin responder
            </p>
          )}
        </div>
        <Button onClick={sync} disabled={syncing} variant="outline" size="sm">
          <RefreshCw className={cn("mr-2 h-4 w-4", syncing && "animate-spin")} />
          Sincronizar
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Buscar pregunta..."
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 w-40 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending_reply">Sin responder</SelectItem>
            <SelectItem value="answered">Respondidas</SelectItem>
            <SelectItem value="open">Abiertas</SelectItem>
            <SelectItem value="closed">Cerradas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto border rounded-lg">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
            <ShoppingBag className="h-10 w-10 opacity-30" />
            <p className="text-sm">No hay preguntas</p>
            <Button variant="outline" size="sm" onClick={sync} disabled={syncing}>
              <RefreshCw className={cn("mr-2 h-3.5 w-3.5", syncing && "animate-spin")} />
              Sincronizar desde ML
            </Button>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Estado</TableHead>
                <TableHead>Comprador</TableHead>
                <TableHead>Pregunta</TableHead>
                <TableHead>Producto</TableHead>
                <TableHead>Hace</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {conversations.map(conv => (
                <TableRow
                  key={conv.id}
                  className={cn(
                    "cursor-pointer hover:bg-muted/50",
                    conv.status === "pending_reply" && "bg-amber-50/50 dark:bg-amber-950/10"
                  )}
                  onClick={() => openConversation(conv)}
                >
                  <TableCell>
                    {conv.status === "pending_reply" ? (
                      <Badge variant="outline" className="border-amber-400 text-amber-600 dark:text-amber-400 gap-1">
                        <Clock className="h-3 w-3" />
                        Sin responder
                      </Badge>
                    ) : conv.status === "answered" ? (
                      <Badge variant="outline" className="border-green-400 text-green-600 dark:text-green-400 gap-1">
                        <CheckCircle2 className="h-3 w-3" />
                        Respondida
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{conv.status}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-sm">
                    {conv.customer_name ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-xs">
                    <p className="truncate text-sm">{conv.subject ?? "—"}</p>
                  </TableCell>
                  <TableCell className="max-w-[180px]">
                    <p className="truncate text-xs text-muted-foreground">
                      {conv.product_title ?? "—"}
                    </p>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatDistanceToNow(new Date(conv.last_message_at), { locale: es, addSuffix: true })}
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" className="h-7 text-xs">
                      Responder
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {/* Reply Dialog */}
      <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="text-base">
              {selected?.customer_name ?? "Pregunta"} — {selected?.product_title ?? ""}
            </DialogTitle>
          </DialogHeader>

          {/* Message thread */}
          <ScrollArea className="flex-1 border rounded-lg p-3 max-h-72">
            {loadingMessages ? (
              <div className="flex justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : (
              <div className="space-y-3">
                {messages.map(msg => (
                  <div
                    key={msg.id}
                    className={cn(
                      "flex",
                      msg.direction === "outbound" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[80%] rounded-xl px-3 py-2 text-sm",
                        msg.direction === "outbound"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      {msg.direction === "inbound" && msg.author_name && (
                        <p className="text-[10px] font-semibold mb-0.5 opacity-60">{msg.author_name}</p>
                      )}
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                      <p className={cn(
                        "text-[10px] mt-1 text-right",
                        msg.direction === "outbound" ? "opacity-70" : "text-muted-foreground"
                      )}>
                        {new Date(msg.created_at).toLocaleString("es-AR", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          {/* Quick templates */}
          {templates.length > 0 && (
            <div className="flex gap-1.5 flex-wrap">
              <span className="text-xs text-muted-foreground self-center">Plantillas:</span>
              {templates.map(t => (
                <button
                  key={t.id}
                  className="rounded-full border px-2 py-0.5 text-xs hover:bg-muted transition-colors"
                  onClick={() => setReplyText(t.body)}
                  title={t.body}
                >
                  {t.name}
                </button>
              ))}
            </div>
          )}

          {sendError && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
              <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{sendError}</span>
            </div>
          )}

          <Textarea
            className="min-h-[80px] resize-none text-sm"
            placeholder="Escribí tu respuesta..."
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
          />

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
            <Button onClick={sendReply} disabled={sending || !replyText.trim()}>
              {sending
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Enviando...</>
                : <><Send className="mr-2 h-4 w-4" />Enviar respuesta</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
