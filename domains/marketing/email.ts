// Email marketing platforms: Klaviyo, Mailchimp, Brevo, HubSpot, ActiveCampaign

// ── Klaviyo ───────────────────────────────────────────────────────────────────

export async function getKlaviyoCampaigns(credentials: Record<string, any>) {
  const res = await fetch(
    "https://a.klaviyo.com/api/campaigns/?filter=equals(messages.channel,'email')&sort=-created_at&page[size]=50",
    {
      headers: {
        Authorization: `Klaviyo-API-Key ${credentials.api_key}`,
        revision: "2024-07-15",
        "Content-Type": "application/json",
      },
    },
  )
  if (!res.ok) throw new Error(`Klaviyo campaigns error: ${await res.text()}`)
  const data = await res.json()

  return (data.data ?? []).map((c: any) => ({
    id: c.id,
    name: c.attributes.name,
    status: c.attributes.status,
    send_time: c.attributes.send_time,
    created_at: c.attributes.created_at,
  }))
}

export async function getKlaviyoMetrics(credentials: Record<string, any>) {
  const res = await fetch("https://a.klaviyo.com/api/metrics/", {
    headers: {
      Authorization: `Klaviyo-API-Key ${credentials.api_key}`,
      revision: "2024-07-15",
    },
  })
  if (!res.ok) throw new Error(`Klaviyo metrics error: ${await res.text()}`)
  return res.json()
}

export async function getKlaviyoLists(credentials: Record<string, any>) {
  const res = await fetch("https://a.klaviyo.com/api/lists/?fields[list]=name,created,profile_count", {
    headers: {
      Authorization: `Klaviyo-API-Key ${credentials.api_key}`,
      revision: "2024-07-15",
    },
  })
  if (!res.ok) throw new Error(`Klaviyo lists error: ${await res.text()}`)
  const data = await res.json()
  return (data.data ?? []).map((l: any) => ({
    id: l.id,
    name: l.attributes.name,
    profile_count: l.attributes.profile_count,
    created: l.attributes.created,
  }))
}

export async function getKlaviyoFlows(credentials: Record<string, any>) {
  const res = await fetch("https://a.klaviyo.com/api/flows/?sort=-created&page[size]=20", {
    headers: {
      Authorization: `Klaviyo-API-Key ${credentials.api_key}`,
      revision: "2024-07-15",
    },
  })
  if (!res.ok) throw new Error(`Klaviyo flows error: ${await res.text()}`)
  const data = await res.json()
  return (data.data ?? []).map((f: any) => ({
    id: f.id,
    name: f.attributes.name,
    status: f.attributes.status,
    created: f.attributes.created,
    trigger_type: f.attributes.trigger_type,
  }))
}

// ── Mailchimp ─────────────────────────────────────────────────────────────────

export async function getMailchimpCampaigns(credentials: Record<string, any>) {
  const server = credentials.server_prefix || "us1"
  const res = await fetch(
    `https://${server}.api.mailchimp.com/3.0/campaigns?count=50&sort_field=send_time&sort_dir=DESC`,
    {
      headers: {
        Authorization: `Basic ${Buffer.from(`anystring:${credentials.api_key}`).toString("base64")}`,
        "Content-Type": "application/json",
      },
    },
  )
  if (!res.ok) throw new Error(`Mailchimp campaigns error: ${await res.text()}`)
  const data = await res.json()

  return (data.campaigns ?? []).map((c: any) => ({
    id: c.id,
    name: c.settings?.title || c.settings?.subject_line,
    subject: c.settings?.subject_line,
    status: c.status,
    send_time: c.send_time,
    emails_sent: c.emails_sent,
    opens: c.report_summary?.opens,
    clicks: c.report_summary?.clicks,
    open_rate: c.report_summary?.open_rate,
    click_rate: c.report_summary?.click_rate,
    unsubscribes: c.report_summary?.unsubscribes,
  }))
}

export async function getMailchimpLists(credentials: Record<string, any>) {
  const server = credentials.server_prefix || "us1"
  const res = await fetch(`https://${server}.api.mailchimp.com/3.0/lists?count=20`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`anystring:${credentials.api_key}`).toString("base64")}`,
    },
  })
  if (!res.ok) throw new Error(`Mailchimp lists error: ${await res.text()}`)
  const data = await res.json()
  return (data.lists ?? []).map((l: any) => ({
    id: l.id,
    name: l.name,
    member_count: l.stats?.member_count,
    campaign_count: l.campaign_count,
  }))
}

// ── Brevo (Sendinblue) ────────────────────────────────────────────────────────

export async function getBrevoEmailCampaigns(credentials: Record<string, any>) {
  const res = await fetch("https://api.brevo.com/v3/emailCampaigns?limit=50&sort=desc&offset=0", {
    headers: {
      "api-key": credentials.api_key,
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) throw new Error(`Brevo campaigns error: ${await res.text()}`)
  const data = await res.json()

  return (data.campaigns ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    subject: c.subject,
    status: c.status,
    send_time: c.scheduledAt || c.sentDate,
    recipients: c.statistics?.globalStats?.sent,
    opens: c.statistics?.globalStats?.uniqueOpens,
    clicks: c.statistics?.globalStats?.uniqueClicks,
    open_rate:
      c.statistics?.campaignStats?.[0]?.uniqueOpens && c.statistics?.campaignStats?.[0]?.delivered
        ? (c.statistics.campaignStats[0].uniqueOpens / c.statistics.campaignStats[0].delivered) * 100
        : 0,
    unsubscribes: c.statistics?.globalStats?.unsubscribes,
  }))
}

export async function getBrevoContacts(credentials: Record<string, any>) {
  const res = await fetch("https://api.brevo.com/v3/contacts?limit=1&offset=0", {
    headers: { "api-key": credentials.api_key },
  })
  if (!res.ok) throw new Error(`Brevo contacts error: ${await res.text()}`)
  const data = await res.json()
  return { total: data.count ?? 0 }
}

// ── HubSpot ───────────────────────────────────────────────────────────────────

export async function getHubSpotCampaigns(credentials: Record<string, any>) {
  const res = await fetch("https://api.hubapi.com/marketing/v3/emails?limit=50&sort=-updatedAt", {
    headers: {
      Authorization: `Bearer ${credentials.api_key}`,
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) throw new Error(`HubSpot campaigns error: ${await res.text()}`)
  const data = await res.json()

  return (data.objects ?? data.results ?? []).map((e: any) => ({
    id: e.id,
    name: e.name,
    subject: e.subject,
    status: e.state,
    send_time: e.publishDate || e.updatedAt,
    stats: e.stats,
  }))
}

export async function getHubSpotContacts(credentials: Record<string, any>) {
  const res = await fetch("https://api.hubapi.com/crm/v3/objects/contacts?limit=1", {
    headers: { Authorization: `Bearer ${credentials.api_key}` },
  })
  if (!res.ok) throw new Error(`HubSpot contacts error: ${await res.text()}`)
  const data = await res.json()
  return { total: data.total ?? 0 }
}

// ── ActiveCampaign ────────────────────────────────────────────────────────────

export async function getActiveCampaignCampaigns(credentials: Record<string, any>) {
  const res = await fetch(`${credentials.api_url}/api/3/campaigns?limit=50&orders[sdate]=DESC`, {
    headers: {
      "Api-Token": credentials.api_key,
      "Content-Type": "application/json",
    },
  })
  if (!res.ok) throw new Error(`ActiveCampaign error: ${await res.text()}`)
  const data = await res.json()

  return (data.campaigns ?? []).map((c: any) => ({
    id: c.id,
    name: c.name,
    subject: c.subject,
    status: c.status,
    send_time: c.sdate,
    sends: parseInt(c.send_amt ?? 0),
    opens: parseInt(c.opens ?? 0),
    clicks: parseInt(c.uniquelinkclicks ?? 0),
    open_rate: c.opens && c.send_amt ? (parseInt(c.opens) / parseInt(c.send_amt)) * 100 : 0,
    unsubscribes: parseInt(c.unsubscribes ?? 0),
  }))
}

// ── WhatsApp Business ─────────────────────────────────────────────────────────

export async function getWhatsAppTemplates(credentials: Record<string, any>) {
  const res = await fetch(`https://graph.facebook.com/v20.0/${credentials.waba_id}/message_templates?limit=50`, {
    headers: { Authorization: `Bearer ${credentials.access_token}` },
  })
  if (!res.ok) throw new Error(`WhatsApp templates error: ${await res.text()}`)
  const data = await res.json()

  return (data.data ?? []).map((t: any) => ({
    id: t.id,
    name: t.name,
    status: t.status,
    category: t.category,
    language: t.language,
    components: t.components?.length ?? 0,
  }))
}

export async function getWhatsAppPhoneInfo(credentials: Record<string, any>) {
  const res = await fetch(
    `https://graph.facebook.com/v20.0/${credentials.phone_number_id}?fields=verified_name,display_phone_number,quality_rating`,
    {
      headers: { Authorization: `Bearer ${credentials.access_token}` },
    },
  )
  if (!res.ok) throw new Error(`WhatsApp phone info error: ${await res.text()}`)
  return res.json()
}
