import { createAdminClient } from "@/lib/db/admin"
import { NextRequest, NextResponse } from "next/server"
import {
  getKlaviyoCampaigns, getKlaviyoLists, getKlaviyoFlows,
  getMailchimpCampaigns, getMailchimpLists,
  getBrevoEmailCampaigns, getBrevoContacts,
  getHubSpotCampaigns, getHubSpotContacts,
  getActiveCampaignCampaigns,
  getWhatsAppTemplates, getWhatsAppPhoneInfo,
} from "@/domains/marketing/email"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params
  const supabase = createAdminClient()

  const { data: conn } = await supabase
    .from("marketing_connections")
    .select("credentials")
    .eq("platform", platform)
    .eq("is_active", true)
    .single()

  if (!conn) return NextResponse.json({ error: `${platform} no conectado` }, { status: 404 })

  try {
    let result: any = {}

    switch (platform) {
      case "klaviyo": {
        const [campaigns_k, lists_k, flows_k] = await Promise.all([
          getKlaviyoCampaigns(conn.credentials),
          getKlaviyoLists(conn.credentials),
          getKlaviyoFlows(conn.credentials),
        ])
        result = { campaigns: campaigns_k, lists: lists_k, flows: flows_k }
        break
      }

      case "mailchimp": {
        const [campaigns_m, lists_m] = await Promise.all([
          getMailchimpCampaigns(conn.credentials),
          getMailchimpLists(conn.credentials),
        ])
        result = { campaigns: campaigns_m, lists: lists_m }
        break
      }

      case "brevo": {
        const [campaigns_b, contacts_b] = await Promise.all([
          getBrevoEmailCampaigns(conn.credentials),
          getBrevoContacts(conn.credentials),
        ])
        result = { campaigns: campaigns_b, contacts: contacts_b }
        break
      }

      case "hubspot": {
        const [campaigns_h, contacts_h] = await Promise.all([
          getHubSpotCampaigns(conn.credentials),
          getHubSpotContacts(conn.credentials),
        ])
        result = { campaigns: campaigns_h, contacts: contacts_h }
        break
      }

      case "activecampaign":
        result = { campaigns: await getActiveCampaignCampaigns(conn.credentials) }
        break

      case "whatsapp": {
        const [templates_w, phone_w] = await Promise.all([
          getWhatsAppTemplates(conn.credentials),
          getWhatsAppPhoneInfo(conn.credentials).catch(() => null),
        ])
        result = { templates: templates_w, phone: phone_w }
        break
      }

      default:
        return NextResponse.json({ error: "Platform not supported" }, { status: 400 })
    }

    return NextResponse.json({ platform, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
