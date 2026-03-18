"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  ChevronDown,
  Instagram,
  Phone,
  Mail,
  ShoppingBag,
  Clock,
  CheckCheck,
  AlertCircle,
  Filter,
  Loader2,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

// ─── Types ─────────────────────────────────────────────────────────────────────
interface Conversation {
  id: string
  channel: string
  external_id: string | null
  customer_name: string | null
  customer_id: string | null
  subject: string | null
  product_title: string | null
  status: string
  priority: number
  unread_count: number
  message_count: number
  last_message_at: string
  created_at: string
}

interface Message {
  id: string
  conversation_id: string
  direction: "inbound" | "outbound"
  author_type: string
  author_name: string | null
  content: string
  content_type: string
  created_at: string
  is_read: boolean
}

interface Template {
  id: string
  name: string
  category: string | null
  body: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  ml_question: <ShoppingBag className="h-3.5 w-3.5" />,
  ml_message:  <MessageSquare className="h-3.5 w-3.5" />,
  whatsapp:    <Phone className="h-3.5 w-3.5" />,
  instagram:   <Instagram className="h-3.5 w-3.5" />,
  email:       <Mail className="h-3.5 w-3.5" />,
}

const CHANNEL_LABELS: Record<string, string> = {
  ml_question: "ML Pregunta",
  ml_message:  "ML Mensaje",
  whatsapp:    "WhatsApp",
  instagram:   "Instagram",
  email:       "Email",
}

const STATUS_COLORS: Record<string, string> = {
  open:          "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  pending_reply: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  answered:      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  closed:        "bg-muted text-muted-foreground",
}

const STATUS_LABELS: Record<string, string> = {
  open:          "Abierto",
  pending_reply: "Sin responder",
  answered:      "Respondido",
  closed:        "Cerrado",
}

function ChannelBadge({ channel }: { channel: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
      {CHANNEL_ICONS[channel] ?? <MessageSquare className="h-3 w-3" />}
      {CHANNEL_LABELS[channel] ?? channel}
    </span>
  )
}

// ─── Main Component ────────────────────────────────────────────────────────────
export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [messages, setMessages]           = useState<Message[]>([])
  const [selectedConv, setSelectedConv]   = useState<Conversation | null>(null)
  const [templates, setTemplates]         = useState<Template[]>([])

  // Filters
  const [channelFilter, setChannelFilter] = useState<string>("all")
  const [statusFilter, setStatusFilter]   = useState<string>("open")
  const [searchQ, setSearchQ]             = useState("")

  // Reply
  const [replyText, setReplyText]         = useState("")
  const [sending, setSending]             = useState(false)
  const [sendError, setSendError]         = useState<string | null>(null)

  // Loading
  const [loadingList, setLoadingList]     = useState(false)
  const [loadingConv, setLoadingConv]     = useState(false)
  const [syncing, setSyncing]             = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)

  // ── Load conversation list ──────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    setLoadingList(true)
    try {
      const params = new URLSearchParams({ limit: "50" })
      if (channelFilter !== "all") params.set("channel", channelFilter)
      if (statusFilter  !== "all") params.set("status", statusFilter)
      if (searchQ.trim()) params.set("q", searchQ.trim())

      const res = await fetch(`/api/cs/conversations?${params}`)
      const data = await res.json()
      setConversations(data.conversations ?? [])
    } finally {
      setLoadingList(false)
    }
  }, [channelFilter, statusFilter, searchQ])

  useEffect(() => { loadConversations() }, [loadConversations])

  // ── Load conversation detail ────────────────────────────────────────────────
  const loadConversation = useCallback(async (id: string) => {
    setLoadingConv(true)
    try {
      const res = await fetch(`/api/cs/conversations/${id}`)
      const data = await res.json()
      setSelectedConv(data.conversation ?? null)
      setMessages(data.messages ?? [])
      // Refresh list to clear unread badge
      loadConversations()
    } finally {
      setLoadingConv(false)
    }
  }, [loadConversations])

  useEffect(() => {
    if (selectedId) loadConversation(selectedId)
  }, [selectedId, loadConversation])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  // ── Load templates ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/cs/templates")
      .then(r => r.json())
      .then(d => setTemplates(d.templates ?? []))
      .catch(() => {})
  }, [])

  // ── Sync ML questions ───────────────────────────────────────────────────────
  const syncML = async () => {
    setSyncing(true)
    try {
      await fetch("/api/cs/ml-questions?sync=1")
      await loadConversations()
    } finally {
      setSyncing(false)
    }
  }

  // ── Send reply ──────────────────────────────────────────────────────────────
  const sendReply = async () => {
    if (!selectedId || !replyText.trim()) return
    setSending(true)
    setSendError(null)
    try {
      const res = await fetch(`/api/cs/conversations/${selectedId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: replyText.trim() }),
      })
      const data = await res.json()
      if (data.channel_error) {
        setSendError(data.warning ?? data.channel_error)
      }
      setReplyText("")
      await loadConversation(selectedId)
    } catch (err: any) {
      setSendError(err.message)
    } finally {
      setSending(false)
    }
  }

  // ── Change conversation status ──────────────────────────────────────────────
  const changeStatus = async (status: string) => {
    if (!selectedId) return
    await fetch(`/api/cs/conversations/${selectedId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    })
    await loadConversation(selectedId)
    await loadConversations()
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-56px)] overflow-hidden">
      {/* ── Col 1: Filters + Conversation List ──────────────────────────── */}
      <div className="flex w-80 flex-shrink-0 flex-col border-r bg-background">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 border-b">
          <h1 className="text-base font-semibold">Centro de Mensajes</h1>
          <Button
            variant="ghost" size="icon" className="h-7 w-7"
            onClick={syncML} disabled={syncing}
            title="Sincronizar preguntas ML"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
          </Button>
        </div>

        {/* Search */}
        <div className="px-3 py-2 border-b">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              className="h-7 pl-7 text-xs"
              placeholder="Buscar..."
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
            />
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5 px-3 py-2 border-b">
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Canal" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los canales</SelectItem>
              <SelectItem value="ml_question">ML Preguntas</SelectItem>
              <SelectItem value="ml_message">ML Mensajes</SelectItem>
              <SelectItem value="whatsapp">WhatsApp</SelectItem>
              <SelectItem value="instagram">Instagram</SelectItem>
              <SelectItem value="email">Email</SelectItem>
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="h-7 text-xs flex-1">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="open">Abiertos</SelectItem>
              <SelectItem value="pending_reply">Sin responder</SelectItem>
              <SelectItem value="answered">Respondidos</SelectItem>
              <SelectItem value="closed">Cerrados</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Conversation list */}
        <ScrollArea className="flex-1">
          {loadingList ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 px-4 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Sin conversaciones</p>
              <Button variant="outline" size="sm" onClick={syncML} disabled={syncing}>
                <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", syncing && "animate-spin")} />
                Sincronizar ML
              </Button>
            </div>
          ) : (
            conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 border-b hover:bg-muted/50 transition-colors",
                  selectedId === conv.id && "bg-muted",
                  conv.unread_count > 0 && "bg-blue-50/50 dark:bg-blue-950/20"
                )}
              >
                <div className="flex items-start justify-between gap-1 mb-0.5">
                  <span className="text-xs font-medium truncate leading-tight">
                    {conv.customer_name ?? "Cliente"}
                  </span>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatDistanceToNow(new Date(conv.last_message_at), { locale: es, addSuffix: false })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground truncate leading-snug mb-1">
                  {conv.subject ?? "(sin asunto)"}
                </p>
                <div className="flex items-center gap-1 flex-wrap">
                  <ChannelBadge channel={conv.channel} />
                  <span className={cn("inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium", STATUS_COLORS[conv.status])}>
                    {STATUS_LABELS[conv.status] ?? conv.status}
                  </span>
                  {conv.unread_count > 0 && (
                    <span className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                      {conv.unread_count}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </ScrollArea>
      </div>

      {/* ── Col 2: Conversation Detail + Reply ──────────────────────────── */}
      <div className="flex flex-1 flex-col min-w-0">
        {!selectedConv ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center p-8">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
            <p className="text-muted-foreground">Seleccioná una conversación para ver los mensajes</p>
          </div>
        ) : (
          <>
            {/* Conversation header */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-background">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold truncate">
                    {selectedConv.customer_name ?? "Cliente"}
                  </h2>
                  <ChannelBadge channel={selectedConv.channel} />
                </div>
                {selectedConv.subject && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {selectedConv.subject}
                  </p>
                )}
                {selectedConv.product_title && (
                  <p className="text-xs text-muted-foreground/70 truncate">
                    Producto: {selectedConv.product_title}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Select value={selectedConv.status} onValueChange={changeStatus}>
                  <SelectTrigger className="h-7 w-36 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Abierto</SelectItem>
                    <SelectItem value="pending_reply">Sin responder</SelectItem>
                    <SelectItem value="answered">Respondido</SelectItem>
                    <SelectItem value="closed">Cerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 px-4 py-3">
              {loadingConv ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : messages.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">Sin mensajes</p>
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
                          "max-w-[70%] rounded-2xl px-3.5 py-2 text-sm shadow-sm",
                          msg.direction === "outbound"
                            ? "bg-primary text-primary-foreground rounded-br-sm"
                            : "bg-muted rounded-bl-sm"
                        )}
                      >
                        {msg.direction === "inbound" && msg.author_name && (
                          <p className="text-[10px] font-semibold mb-0.5 opacity-70">
                            {msg.author_name}
                          </p>
                        )}
                        <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                        <div className="flex items-center justify-end gap-1 mt-1 opacity-60">
                          <span className="text-[10px]">
                            {new Date(msg.created_at).toLocaleTimeString("es-AR", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                          {msg.direction === "outbound" && (
                            <CheckCheck className="h-3 w-3" />
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </ScrollArea>

            <Separator />

            {/* Reply box */}
            <div className="p-3 bg-background">
              {sendError && (
                <div className="mb-2 flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{sendError}</span>
                </div>
              )}

              {/* Quick templates */}
              {templates.length > 0 && (
                <div className="mb-2 flex gap-1 flex-wrap">
                  {templates.slice(0, 4).map(t => (
                    <button
                      key={t.id}
                      className="rounded-full border px-2 py-0.5 text-[11px] hover:bg-muted transition-colors"
                      onClick={() => setReplyText(t.body)}
                      title={t.body}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              )}

              <div className="flex gap-2">
                <Textarea
                  className="min-h-[60px] max-h-32 resize-none text-sm flex-1"
                  placeholder="Escribí tu respuesta..."
                  value={replyText}
                  onChange={e => setReplyText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      sendReply()
                    }
                  }}
                />
                <Button
                  onClick={sendReply}
                  disabled={sending || !replyText.trim()}
                  size="icon"
                  className="h-full w-10 shrink-0"
                >
                  {sending
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Send className="h-4 w-4" />
                  }
                </Button>
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Ctrl+Enter para enviar
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
