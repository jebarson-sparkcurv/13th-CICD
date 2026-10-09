from datetime import date

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                PageBreak, Flowable, KeepTogether)

BLUE = colors.HexColor("#2563EB")
AMBER = colors.HexColor("#F59E0B")
DARK = colors.HexColor("#0F172A")
SLATE = colors.HexColor("#64748B")
BORDER = colors.HexColor("#E2E8F0")
LIGHT = colors.HexColor("#F8FAFC")
EMERALD = colors.HexColor("#10B981")

ss = getSampleStyleSheet()
S = {
    "cover_title": ParagraphStyle("ct", parent=ss["Title"], fontName="Helvetica-Bold", fontSize=34,
                                  textColor=DARK, alignment=0, leading=40),
    "cover_sub": ParagraphStyle("cs", parent=ss["Normal"], fontSize=13, textColor=SLATE, spaceBefore=10),
    "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold", fontSize=19,
                         textColor=DARK, spaceBefore=6, spaceAfter=10),
    "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold", fontSize=13,
                         textColor=BLUE, spaceBefore=14, spaceAfter=6),
    "body": ParagraphStyle("b", parent=ss["Normal"], fontSize=9.5, textColor=colors.HexColor("#334155"),
                           leading=14, spaceAfter=6),
    "step": ParagraphStyle("st", parent=ss["Normal"], fontSize=9.5, textColor=colors.HexColor("#334155"),
                           leading=14, leftIndent=14, spaceAfter=3),
    "cell": ParagraphStyle("cl", parent=ss["Normal"], fontSize=8.5, textColor=colors.HexColor("#334155"), leading=12),
    "cellb": ParagraphStyle("clb", parent=ss["Normal"], fontSize=8.5, fontName="Helvetica-Bold",
                            textColor=DARK, leading=12),
}


class FlowDiagram(Flowable):
    """Horizontal box→box flow, wraps to rows."""

    def __init__(self, steps, width=180 * mm, box_h=11 * mm, per_row=4, accent=BLUE):
        super().__init__()
        self.steps, self.w, self.box_h, self.per_row, self.accent = steps, width, box_h, per_row, accent
        self.rows = [steps[i:i + per_row] for i in range(0, len(steps), per_row)]
        self.row_gap = 6 * mm
        self.height = len(self.rows) * box_h + (len(self.rows) - 1) * self.row_gap

    def wrap(self, aw, ah):
        return self.w, self.height

    def draw(self):
        c = self.canv
        arrow_w = 6 * mm
        box_w = (self.w - (self.per_row - 1) * arrow_w) / self.per_row
        y = self.height - self.box_h
        for ri, row in enumerate(self.rows):
            x = 0
            for i, label in enumerate(row):
                c.setFillColor(LIGHT)
                c.setStrokeColor(self.accent)
                c.setLineWidth(1)
                c.roundRect(x, y, box_w, self.box_h, 2 * mm, stroke=1, fill=1)
                c.setFillColor(DARK)
                c.setFont("Helvetica-Bold", 7.2)
                lines = self._split(label, box_w)
                th = len(lines) * 8
                ty = y + self.box_h / 2 + th / 2 - 7
                for ln in lines:
                    c.drawCentredString(x + box_w / 2, ty, ln)
                    ty -= 8
                if i < len(row) - 1:
                    c.setStrokeColor(SLATE)
                    ax = x + box_w
                    ay = y + self.box_h / 2
                    c.line(ax + 1 * mm, ay, ax + arrow_w - 1.5 * mm, ay)
                    c.setFillColor(SLATE)
                    p = c.beginPath()
                    p.moveTo(ax + arrow_w - 1 * mm, ay)
                    p.lineTo(ax + arrow_w - 2.5 * mm, ay + 1.2 * mm)
                    p.lineTo(ax + arrow_w - 2.5 * mm, ay - 1.2 * mm)
                    p.close()
                    c.drawPath(p, stroke=0, fill=1)
                x += box_w + arrow_w
            if ri < len(self.rows) - 1:
                c.setStrokeColor(SLATE)
                c.setDash(2, 2)
                lx = x - arrow_w - box_w / 2
                c.line(lx, y, lx, y - self.row_gap + 1 * mm)
                c.setDash()
                c.setFillColor(SLATE)
                p = c.beginPath()
                p.moveTo(lx, y - self.row_gap + 0.5 * mm)
                p.lineTo(lx - 1.2 * mm, y - self.row_gap + 2 * mm)
                p.lineTo(lx + 1.2 * mm, y - self.row_gap + 2 * mm)
                p.close()
                c.drawPath(p, stroke=0, fill=1)
            y -= self.box_h + self.row_gap

    def _split(self, text, box_w):
        max_chars = max(8, int(box_w / (4.2)))
        words = text.split()
        lines, cur = [], ""
        for w in words:
            if len(cur) + len(w) + 1 <= max_chars:
                cur = (cur + " " + w).strip()
            else:
                lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines[:3]


def steps(items):
    return [Paragraph(f"<font color='#2563EB'><b>{i}.</b></font> {t}", S["step"]) for i, t in enumerate(items, 1)]


def role_header(title, subtitle):
    t = Table([[Paragraph(f"<font color='white'><b>{title}</b></font>", S["cellb"]),
                Paragraph(f"<font color='#CBD5E1'>{subtitle}</font>", S["cell"])]],
              colWidths=[55 * mm, 125 * mm])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), DARK),
                           ("TOPPADDING", (0, 0), (-1, -1), 7), ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
                           ("LEFTPADDING", (0, 0), (-1, -1), 10)]))
    return t


def _footer(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(SLATE)
    canvas.drawString(15 * mm, 9 * mm, "BUILDCORE — Construction Management Portal · Workflow Guide v1.0")
    canvas.drawRightString(A4[0] - 15 * mm, 9 * mm, f"Page {doc.page}")
    canvas.setStrokeColor(BORDER)
    canvas.line(15 * mm, 12 * mm, A4[0] - 15 * mm, 12 * mm)
    canvas.restoreState()


def build():
    doc = SimpleDocTemplate("/app/frontend/public/BUILDCORE_Workflow_Guide.pdf", pagesize=A4,
                            leftMargin=15 * mm, rightMargin=15 * mm, topMargin=16 * mm, bottomMargin=16 * mm,
                            title="BUILDCORE Workflow Guide")
    E = []

    # ---- Cover ----
    E.append(Spacer(1, 50 * mm))
    E.append(Paragraph("BUILD<font color='#F59E0B'>CORE</font>", S["cover_title"]))
    E.append(Paragraph("Construction Management Portal — Complete Workflow Guide", S["cover_sub"]))
    E.append(Spacer(1, 6 * mm))
    E.append(Paragraph(f"Version 1.0 · Generated {date.today().isoformat()}", S["cell"]))
    E.append(Spacer(1, 10 * mm))
    cover_tbl = Table([["Modules", "Project Planning · Field Ops · Procurement · Finance · Clients · Users · Vendor Bidding · Alerts"],
                       ["Roles", "Admin · Site Engineer · Accountant · Procurement Officer · Client · Vendor"]],
                      colWidths=[28 * mm, 152 * mm])
    cover_tbl.setStyle(TableStyle([("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), BLUE),
                                   ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
                                   ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                                   ("TOPPADDING", (0, 0), (-1, -1), 6), ("BOTTOMPADDING", (0, 0), (-1, -1), 6)]))
    E.append(cover_tbl)
    E.append(PageBreak())

    # ---- 1. Overview ----
    E.append(Paragraph("1. System Overview", S["h1"]))
    E.append(Paragraph("BUILDCORE is a role-based construction management portal. Every project moves through a "
                       "consistent lifecycle — from client onboarding to final balance sheet. Each role sees only "
                       "the modules and projects relevant to them.", S["body"]))
    E.append(Paragraph("Master Project Lifecycle", S["h2"]))
    E.append(FlowDiagram(["Client onboarded", "Project created (budget, engineer)", "Phases planned",
                          "Field Ops: crew + attendance", "Procurement: bids, POs, subcontracts",
                          "Progress updates + alerts", "Finance: invoices, payments, expenses, payroll",
                          "Balance sheet + reports"], per_row=4))
    E.append(Spacer(1, 6 * mm))
    E.append(Paragraph("Roles & Access", S["h2"]))
    roles = [["Role", "Primary responsibility", "Key screens"],
             ["Admin", "Full control of every module", "Dashboard, Projects, Field Ops, Clients, Finance, Vendors, Users"],
             ["Site Engineer", "Site execution: phases, progress, attendance", "Projects (assigned), Field Ops, Vendors"],
             ["Accountant", "Money in/out: invoices, payroll, balance sheets", "Finance, Payroll, Clients, Projects"],
             ["Procurement Officer", "Vendors, bids, purchase orders", "Vendors, Bid Packages, Project Procurement"],
             ["Client", "Read-only visibility of THEIR projects", "Dashboard, Projects, Field Ops (view-only)"],
             ["Vendor", "Bid on invited packages", "Bid Invites portal"]]
    rt = Table([[Paragraph(f"<b>{r[0]}</b>", S["cellb"]), Paragraph(r[1], S["cell"]), Paragraph(r[2], S["cell"])]
                for r in roles], colWidths=[32 * mm, 68 * mm, 80 * mm], repeatRows=1)
    rt.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, 0), DARK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                            ("GRID", (0, 0), (-1, -1), 0.5, BORDER),
                            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
                            ("TOPPADDING", (0, 0), (-1, -1), 5), ("BOTTOMPADDING", (0, 0), (-1, -1), 5)]))
    E.append(rt)
    E.append(PageBreak())

    # ---- 2. Project Planning ----
    E.append(Paragraph("2. Project Planning Workflow", S["h1"]))
    E.append(FlowDiagram(["Add Client", "New Project + budget", "Add Phases (sequence)", "Assign crew to phases",
                          "Post progress updates", "Track % complete"], per_row=3))
    E.append(Spacer(1, 4 * mm))
    E += steps([
        "Admin opens <b>Clients → New Client</b> and registers the client company with contact details.",
        "Go to <b>Projects → New Project</b>: enter name, select client & site engineer, set location (auto-detect available) "
        "and budget in ₹ (live crore preview shown, e.g. 250000000 = ₹25.00 Cr).",
        "Open the project → <b>Phases</b> tab → Add Phase for each stage (Foundation, Structure, Finishing…) with planned dates.",
        "Assign employees to phases (Crew → Assign) so labour is mapped to the right work.",
        "Site engineer posts <b>Tracking</b> updates with photos, % progress and a status flag (OnTrack / Delayed / Blocked).",
        "Overall completion is computed automatically as the average of phase progress; issues raise a red 'Active Issues' flag.",
    ])
    E.append(Paragraph("Blocked Work Alerts: whenever a phase or update is flagged Blocked/Delayed, all Admins and the "
                       "project's site engineer instantly receive an in-app notification (bell icon in the sidebar).", S["body"]))

    # ---- 3. Field Ops ----
    E.append(Paragraph("3. Field Ops — Employees & Attendance", S["h1"]))
    E.append(FlowDiagram(["Add Employee (trade + wage)", "Select project & date", "One-tap attendance P / ½ / A / L",
                          "Labour cost auto-computed", "Feeds balance sheet"], per_row=3, accent=AMBER))
    E.append(Spacer(1, 4 * mm))
    E += steps([
        "Site engineer or Admin opens <b>Field Ops</b>, selects the project and date (up to 3 days back; Admin unlimited).",
        "Register workers with <b>Add Employee</b>: name, trade category (Mason, Electrician…), wage type & daily wage.",
        "Mark attendance with one tap per worker: <b>P</b> present, <b>½</b> half-day, <b>A</b> absent, <b>L</b> leave.",
        "Labour cost is computed automatically (days × daily wage) and flows into the project ledger and balance sheets.",
        "Clients see a <b>view-only</b> Field Ops page for their own projects — wages and personal data stay hidden.",
    ])
    E.append(PageBreak())

    # ---- 4. Procurement ----
    E.append(Paragraph("4. Procurement & Vendor Bidding Workflow", S["h1"]))
    E.append(FlowDiagram(["Register Vendor + insurance docs", "Create Bid Package", "Invite vendors",
                          "Vendors submit bids", "Compare & award", "Draft PO / Subcontract",
                          "Approve (insurance-gated)", "Deliveries & Pay Applications"], per_row=4))
    E.append(Spacer(1, 4 * mm))
    E += steps([
        "Register vendors under <b>Vendors</b> with trade, contacts and insurance documents (expiry is tracked).",
        "Create a <b>Bid Package</b> for a scope of work on a project and invite selected vendors.",
        "Invited vendors log into their portal (<b>Bid Invites</b>) and submit price + notes before the due date.",
        "Use <b>Bid Comparison</b> to review all bids side-by-side and award the winner.",
        "Awarding auto-creates a draft <b>Purchase Order</b> or <b>Subcontract</b> (with retainage %) for the vendor.",
        "Approval is blocked (422) if the vendor's insurance has expired — upload a current certificate first.",
        "Track <b>Change Orders</b> (Admin approval recomputes committed amount), <b>Material Deliveries</b>, and "
        "<b>Pay Applications</b> (retainage auto-calculated, G702/G703 line items, lien waivers) through to payment.",
    ])

    # ---- 5. Finance ----
    E.append(Paragraph("5. Finance Workflow — Invoices, Payroll & Expenses", S["h1"]))
    E.append(FlowDiagram(["Raise client invoice", "Record payments (credit)", "Log site expenses (debit)",
                          "Run staff payroll", "Labour wages accrue", "Project ledger updates live"],
                         per_row=3, accent=EMERALD))
    E.append(Spacer(1, 4 * mm))
    E += steps([
        "Accountant/Admin raises invoices in <b>Project → Finance</b> (amount, due date, description). Status moves "
        "Sent → Partial → Paid automatically, or Overdue past the due date.",
        "Record client payments against invoices — every payment is a <b>credit</b> in the project ledger.",
        "Log site expenses by category (Fuel, Material, Equipment… categories are editable) — each is a <b>debit</b>.",
        "Any invoice can be <b>printed</b> (clean PDF layout) or shared via <b>WhatsApp / Email</b> in one click.",
        "Run <b>Payroll</b> for staff from Finance → Payroll: process a period, review entries, mark paid.",
        "The <b>Org Finance</b> page shows income, cost, profit, outstanding invoices and overdue alerts across all projects.",
    ])
    E.append(PageBreak())

    # ---- 6. Balance Sheets ----
    E.append(Paragraph("6. Balance Sheets & Reports", S["h1"]))
    E.append(FlowDiagram(["All money-in (client payments)", "All money-out (labour, payroll, expenses, procurement)",
                          "Profit / loss per project", "Loss-makers highlighted red",
                          "Employee dues computed", "Export PDF / Excel"], per_row=3))
    E.append(Spacer(1, 4 * mm))
    E += steps([
        "<b>Finance → Balance Sheet</b> tab: total credit, total debit, overall profit and overall loss across all "
        "projects, with loss-making projects highlighted in red.",
        "<b>Required Employee Payments</b> panel: pending staff payroll plus daily-wage labour dues grouped by trade.",
        "<b>Project → Balance Sheet</b> tab: budget, client payment received, payment released, balance, a money-out "
        "breakdown, and every transaction sorted latest-first.",
        "Both balance sheets export to <b>PDF</b> and <b>Excel</b> (multi-sheet workbook) for auditors or banks.",
    ])

    # ---- 7. Role-wise quick paths ----
    E.append(Paragraph("7. Role-wise Daily Workflows", S["h1"]))
    role_flows = [
        ("ADMIN", "Owns everything",
         ["Check Dashboard KPIs & alerts", "Review blocked-work notifications", "Approve POs / change orders",
          "Review balance sheet & loss projects", "Manage users & clients"]),
        ("SITE ENGINEER", "Runs the site",
         ["Open Field Ops → mark today's attendance", "Update phase progress + photos",
          "Flag blocked/delayed work", "Add new workers as they join"]),
        ("ACCOUNTANT", "Owns the money",
         ["Raise / follow up invoices", "Record client payments", "Log expenses & run payroll",
          "Export balance sheets for reporting"]),
        ("PROCUREMENT OFFICER", "Owns buying",
         ["Register vendors & track insurance", "Float bid packages & invite vendors",
          "Compare bids → award", "Track deliveries & pay applications"]),
        ("CLIENT", "Watches progress",
         ["Open Dashboard for project KPIs", "Browse project phases & photo updates",
          "View site attendance (read-only)", "Review shared documents & invoices"]),
        ("VENDOR", "Bids & delivers",
         ["Open Bid Invites portal", "Submit bids before due date", "Track award status"]),
    ]
    for title, sub, items in role_flows:
        E.append(KeepTogether([role_header(title, sub), Spacer(1, 2 * mm)] + steps(items) + [Spacer(1, 3 * mm)]))
    E.append(PageBreak())

    # ---- 8. Permissions matrix ----
    E.append(Paragraph("8. Permissions Quick Reference", S["h1"]))
    header = ["Action", "Admin", "Site Eng.", "Accountant", "Proc. Officer", "Client", "Vendor"]
    Y, N, V = "Yes", "—", "View"
    matrix = [
        ["Create / edit projects", Y, N, N, N, N, N],
        ["Manage phases & progress", Y, "Assigned", N, N, V, N],
        ["Add employees / attendance", Y, "Assigned", Y, Y, V, N],
        ["Edit wages", Y, N, Y, N, N, N],
        ["Invoices & payments", Y, N, Y, N, V, N],
        ["Expenses", Y, Y, Y, Y, N, N],
        ["Payroll", Y, N, Y, N, N, N],
        ["Balance sheets + export", Y, "Project only", Y, "Project only", N, N],
        ["Vendors & bid packages", Y, Y, N, Y, N, "Own bids"],
        ["Approve POs / subcontracts", Y, N, N, N, N, N],
        ["User management", Y, N, N, N, N, N],
        ["Blocked-work alerts", Y, Y, N, N, N, N],
    ]
    mt = Table([header] + matrix, colWidths=[48 * mm, 22 * mm, 22 * mm, 24 * mm, 26 * mm, 19 * mm, 19 * mm],
               repeatRows=1)
    style = [("BACKGROUND", (0, 0), (-1, 0), DARK), ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
             ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"), ("FONTSIZE", (0, 0), (-1, -1), 7.5),
             ("GRID", (0, 0), (-1, -1), 0.5, BORDER), ("ALIGN", (1, 0), (-1, -1), "CENTER"),
             ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, LIGHT]),
             ("TOPPADDING", (0, 0), (-1, -1), 4.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 4.5)]
    for r in range(1, len(matrix) + 1):
        for c in range(1, 7):
            v = ([header] + matrix)[r][c]
            if v == "Yes":
                style.append(("TEXTCOLOR", (c, r), (c, r), EMERALD))
            elif v == "—":
                style.append(("TEXTCOLOR", (c, r), (c, r), colors.HexColor("#CBD5E1")))
            else:
                style.append(("TEXTCOLOR", (c, r), (c, r), AMBER))
    mt.setStyle(TableStyle(style))
    E.append(mt)
    E.append(Spacer(1, 8 * mm))
    E.append(Paragraph("Tips", S["h2"]))
    E += steps([
        "Theme: use the Sun/Moon toggle (sidebar footer or login page) to switch between light and dark themes.",
        "Dashboards are clickable — stat cards filter the project list instantly.",
        "Everything financial exports: balance sheets (PDF/Excel) and invoices (print / WhatsApp / email).",
    ])

    doc.build(E, onFirstPage=_footer, onLaterPages=_footer)
    print("PDF generated: /app/frontend/public/BUILDCORE_Workflow_Guide.pdf")


if __name__ == "__main__":
    build()
