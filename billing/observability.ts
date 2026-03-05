export function logBillingEvent(eventType: string, payload: any) {
  const ts = new Date().toISOString()
  console.log(`[Billing][${ts}][${eventType}] ${JSON.stringify(payload)}`)
}
