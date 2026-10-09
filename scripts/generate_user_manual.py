"""Generate the Sitera User Manual PDF.

Output: /app/docs/Sitera_User_Manual.pdf
Run:    python3 /app/scripts/generate_user_manual.py
"""
from datetime import date
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (BaseDocTemplate, Frame, KeepTogether, PageBreak,
                                PageTemplate, Paragraph, Spacer, Table, TableStyle)

SLATE_900 = colors.HexColor("#0F172A")
SLATE_700 = colors.HexColor("#334155")
SLATE_500 = colors.HexColor("#64748B")
SLATE_300 = colors.HexColor("#CBD5E1")
SLATE_100 = colors.HexColor("#F1F5F9")
SLATE_50  = colors.HexColor("#F8FAFC")
AMBER_500 = colors.HexColor("#F59E0B")
AMBER_100 = colors.HexColor("#FEF3C7")
EMERALD_500 = colors.HexColor("#10B981")
ROSE_500  = colors.HexColor("#F43F5E")
SKY_500   = colors.HexColor("#0EA5E9")


def build_styles():
    ss = getSampleStyleSheet()
    return {
        "h1": ParagraphStyle("h1", parent=ss["Heading1"], fontName="Helvetica-Bold",
                              fontSize=26, leading=32, textColor=SLATE_900, spaceAfter=8,
                              spaceBefore=0),
        "h2": ParagraphStyle("h2", parent=ss["Heading2"], fontName="Helvetica-Bold",
                              fontSize=17, leading=22, textColor=SLATE_900, spaceAfter=6,
                              spaceBefore=14, borderPadding=(0, 0, 4, 0)),
        "h3": ParagraphStyle("h3", parent=ss["Heading3"], fontName="Helvetica-Bold",
                              fontSize=12, leading=16, textColor=SLATE_700, spaceAfter=4,
                              spaceBefore=10),
        "eyebrow": ParagraphStyle("eyebrow", parent=ss["Normal"], fontName="Helvetica-Bold",
                                    fontSize=8, leading=10, textColor=AMBER_500,
                                    spaceAfter=2, spaceBefore=0),
        "body": ParagraphStyle("body", parent=ss["Normal"], fontName="Helvetica",
                                fontSize=10, leading=15, textColor=SLATE_700, spaceAfter=6,
                                alignment=TA_JUSTIFY),
        "bullet": ParagraphStyle("bullet", parent=ss["Normal"], fontName="Helvetica",
                                  fontSize=10, leading=15, textColor=SLATE_700,
                                  leftIndent=14, bulletIndent=4, spaceAfter=3),
        "callout": ParagraphStyle("callout", parent=ss["Normal"], fontName="Helvetica",
                                    fontSize=9.5, leading=14, textColor=SLATE_700,
                                    leftIndent=8, rightIndent=8, spaceAfter=4, spaceBefore=2),
        "hero_title": ParagraphStyle("hero", parent=ss["Heading1"], fontName="Helvetica-Bold",
                                        fontSize=44, leading=52, textColor=SLATE_900,
                                        alignment=TA_LEFT, spaceAfter=6),
        "hero_sub":   ParagraphStyle("hero_sub", parent=ss["Normal"], fontName="Helvetica",
                                        fontSize=14, leading=20, textColor=SLATE_500,
                                        alignment=TA_LEFT, spaceAfter=12),
        "cover_meta": ParagraphStyle("meta", parent=ss["Normal"], fontName="Helvetica-Bold",
                                        fontSize=9, leading=13, textColor=SLATE_500,
                                        alignment=TA_LEFT),
        "toc_line": ParagraphStyle("toc", parent=ss["Normal"], fontName="Helvetica",
                                    fontSize=11, leading=18, textColor=SLATE_700,
                                    spaceAfter=2),
        "toc_num":  ParagraphStyle("tocn", parent=ss["Normal"], fontName="Helvetica-Bold",
                                    fontSize=11, leading=18, textColor=AMBER_500,
                                    spaceAfter=2),
    }


S = build_styles()


def bullet(text):
    return Paragraph(f"•&nbsp;&nbsp;{text}", S["bullet"])


def eyebrow(text):
    return Paragraph(text.upper(), S["eyebrow"])


def h1(text):
    return Paragraph(text, S["h1"])


def h2(text):
    return Paragraph(text, S["h2"])


def h3(text):
    return Paragraph(text, S["h3"])


def body(text):
    return Paragraph(text, S["body"])


def callout(text, bg=SLATE_50, border=SLATE_300):
    t = Table([[Paragraph(text, S["callout"])]], colWidths=[168 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.5, border),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ]))
    return t


def role_badge_row(roles):
    """Small pills that show which roles can use the section."""
    cells = []
    colours = {
        "Admin":            (AMBER_100, colors.HexColor("#92400E")),
        "SiteEngineer":     (colors.HexColor("#E0F2FE"), colors.HexColor("#075985")),
        "Accountant":       (colors.HexColor("#DCFCE7"), colors.HexColor("#166534")),
        "ProcurementOfficer": (colors.HexColor("#F3E8FF"), colors.HexColor("#6B21A8")),
        "Client":           (colors.HexColor("#FEE2E2"), colors.HexColor("#991B1B")),
        "Vendor":           (colors.HexColor("#FFEDD5"), colors.HexColor("#9A3412")),
    }
    for r in roles:
        bg, fg = colours.get(r, (SLATE_100, SLATE_700))
        p = ParagraphStyle(f"role_{r}", fontName="Helvetica-Bold", fontSize=8.5,
                           leading=11, textColor=fg, alignment=TA_CENTER)
        cell = Table([[Paragraph(r, p)]], colWidths=[26 * mm])
        cell.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), bg),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 2),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ("ROUNDEDCORNERS", [4, 4, 4, 4]),
        ]))
        cells.append(cell)
    row = Table([cells], colWidths=[28 * mm] * len(cells))
    row.setStyle(TableStyle([
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 3),
        ("TOPPADDING", (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return row


def step_table(rows):
    """Numbered walk-through steps."""
    data = [[Paragraph(f'<font color="#F59E0B"><b>{i+1}</b></font>', S["body"]),
             Paragraph(r, S["body"])] for i, r in enumerate(rows)]
    t = Table(data, colWidths=[10 * mm, 158 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 0),
        ("RIGHTPADDING", (0, 0), (-1, -1), 0),
        ("TOPPADDING", (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, SLATE_100),
    ]))
    return t


def kv_table(items):
    """Two-column key/value block used for role responsibilities etc."""
    data = [[Paragraph(f"<b>{k}</b>", S["body"]), Paragraph(v, S["body"])] for k, v in items]
    t = Table(data, colWidths=[46 * mm, 122 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LINEBELOW", (0, 0), (-1, -2), 0.25, SLATE_100),
        ("BACKGROUND", (0, 0), (0, -1), SLATE_50),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return t


# ---------------------------------------------------------------------------
# Page templates — cover + content
# ---------------------------------------------------------------------------

class ManualDoc(BaseDocTemplate):
    def __init__(self, path):
        super().__init__(str(path), pagesize=A4, leftMargin=21 * mm,
                         rightMargin=21 * mm, topMargin=25 * mm, bottomMargin=20 * mm,
                         title="Sitera User Manual", author="Sitera")
        frame = Frame(21 * mm, 20 * mm, 168 * mm, 252 * mm, id="body")
        cover_frame = Frame(21 * mm, 20 * mm, 168 * mm, 252 * mm, id="cover")
        self.addPageTemplates([
            PageTemplate(id="Cover", frames=[cover_frame], onPage=self._cover_bg),
            PageTemplate(id="Body", frames=[frame], onPage=self._body_chrome),
        ])

    def _cover_bg(self, canvas, doc):
        canvas.saveState()
        canvas.setFillColor(SLATE_900)
        canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
        # accent bar
        canvas.setFillColor(AMBER_500)
        canvas.rect(0, A4[1] - 6 * mm, A4[0], 6 * mm, fill=1, stroke=0)
        canvas.restoreState()

    def _body_chrome(self, canvas, doc):
        canvas.saveState()
        # top hairline
        canvas.setStrokeColor(SLATE_300)
        canvas.setLineWidth(0.4)
        canvas.line(21 * mm, A4[1] - 15 * mm, A4[0] - 21 * mm, A4[1] - 15 * mm)
        # header wordmark
        canvas.setFillColor(SLATE_900)
        canvas.setFont("Helvetica-Bold", 10)
        canvas.drawString(21 * mm, A4[1] - 12 * mm, "SITE")
        w = canvas.stringWidth("SITE", "Helvetica-Bold", 10)
        canvas.setFillColor(AMBER_500)
        canvas.drawString(21 * mm + w, A4[1] - 12 * mm, "RA")
        canvas.setFillColor(SLATE_500)
        canvas.setFont("Helvetica", 8.5)
        canvas.drawString(21 * mm + w + 12, A4[1] - 12 * mm, "  |  User Manual")
        # right side page number
        canvas.drawRightString(A4[0] - 21 * mm, A4[1] - 12 * mm, f"Page {doc.page}")
        # footer
        canvas.setStrokeColor(SLATE_300)
        canvas.line(21 * mm, 14 * mm, A4[0] - 21 * mm, 14 * mm)
        canvas.setFillColor(SLATE_500)
        canvas.setFont("Helvetica", 8)
        canvas.drawString(21 * mm, 9 * mm, f"© {date.today().year} Sitera · Building Excellence")
        canvas.drawRightString(A4[0] - 21 * mm, 9 * mm, "sitera.in")
        canvas.restoreState()


# ---------------------------------------------------------------------------
# Cover
# ---------------------------------------------------------------------------

def build_cover():
    styles = getSampleStyleSheet()
    title = ParagraphStyle("cov_title", parent=styles["Heading1"], fontName="Helvetica-Bold",
                            fontSize=54, leading=62, textColor=colors.white,
                            alignment=TA_LEFT, spaceAfter=10)
    sub   = ParagraphStyle("cov_sub", parent=styles["Normal"], fontName="Helvetica",
                            fontSize=15, leading=22, textColor=colors.HexColor("#94A3B8"),
                            alignment=TA_LEFT, spaceAfter=6)
    amber_kicker = ParagraphStyle("kick", parent=styles["Normal"], fontName="Helvetica-Bold",
                                    fontSize=10, leading=14, textColor=AMBER_500,
                                    alignment=TA_LEFT, spaceAfter=20)
    meta = ParagraphStyle("cov_meta", parent=styles["Normal"], fontName="Helvetica-Bold",
                            fontSize=9, leading=14, textColor=colors.HexColor("#64748B"),
                            alignment=TA_LEFT)
    return [
        Spacer(1, 30 * mm),
        Paragraph("SITERA · CONSTRUCTION OPERATIONS PLATFORM", amber_kicker),
        Paragraph("User Manual", title),
        Paragraph("Everything you need to run projects, finance,<br/>estimates and field operations end-to-end.", sub),
        Spacer(1, 90 * mm),
        Paragraph("VERSION 1.0", meta),
        Paragraph(f"REVISION · {date.today().strftime('%B %Y')}", meta),
        Paragraph("BUILDING EXCELLENCE", meta),
    ]


# ---------------------------------------------------------------------------
# Content — sections
# ---------------------------------------------------------------------------

def sec_intro():
    return [
        eyebrow("Chapter 01 · Introduction"),
        h1("Welcome to Sitera"),
        body("Sitera is a construction operations platform that brings your entire "
             "project lifecycle into one workspace — from client estimates and project "
             "planning all the way through daily attendance, vendor procurement, "
             "change orders, invoicing, and the balance sheet. This manual walks you "
             "through every screen and every role in the product."),
        h3("What Sitera Solves"),
        bullet("Fragmented tools — replace WhatsApp updates, Excel budgets, and paper receipts with a single system of record."),
        bullet("Blind spots in cash flow — every rupee in and out of a project is visible in a proper accounting ledger."),
        bullet("Slow client sign-offs — estimates are sent, approved, and converted into projects with signed email links."),
        bullet("Site chaos — engineers mark daily attendance from their phone; wages are settled instantly against the project ledger."),
        Spacer(1, 6),
        callout("<b>Who this manual is for:</b> Every user of Sitera — Admins, Site Engineers, Accountants, Procurement Officers, Clients, and Vendors. Each chapter is tagged with the roles that can access it."),
    ]


def sec_getting_started():
    return [
        eyebrow("Chapter 02 · Getting Started"),
        h1("Signing In"),
        body("Sitera is a web application. Open your browser and go to your organisation's Sitera URL "
             "(for example, <b>https://sitera.in</b>). You will land on the sign-in screen."),
        h3("Steps to sign in"),
        step_table([
            "Enter your registered email address in the <b>Email</b> field.",
            "Enter your password in the <b>Password</b> field.",
            "Click <b>SIGN IN</b>. You will be taken to the Dashboard associated with your role.",
            "Use the sun/moon icon on the top-right of the sign-in screen to switch between light and dark themes.",
        ]),
        h3("Forgot your password?"),
        body("Contact your Sitera admin. They can generate a fresh password for you from the "
             "Users → Reset Password action. Passwords should be at least 8 characters and mix letters and numbers."),
        Spacer(1, 4),
        h2("Roles at a Glance"),
        body("Sitera has six user roles. Every screen in this manual is tagged with the roles that can access it."),
        kv_table([
            ("Admin", "Full access. Creates users, manages every module, sees every project."),
            ("Site Engineer", "Runs field operations for their assigned projects — attendance, labour payments, progress updates."),
            ("Accountant", "Handles finance — invoices, expenses, income, payroll, balance sheet."),
            ("Procurement Officer", "Manages vendors, product catalogue, bid packages, and quotations."),
            ("Client", "Read-only view of their own projects, estimates, and invoices. Approves estimates."),
            ("Vendor", "External. Sees bid invites and submits quotations."),
        ]),
    ]


def sec_layout():
    return [
        PageBreak(),
        eyebrow("Chapter 03 · Navigating Sitera"),
        h1("The Application Layout"),
        body("Sitera uses a consistent three-part layout across every screen: a left sidebar with your "
             "navigation, a top area with page context, and a main content area."),
        h3("Sidebar (left)"),
        bullet("The <b>SITERA</b> wordmark at the top identifies the app."),
        bullet("The main nav lists only the modules your role can access — Dashboard, Projects, Field Ops, Clients, Finance, Estimates, Vendors, Users."),
        bullet("Below the nav sits an <b>Alerts</b> bell with an unread-count badge."),
        bullet("At the bottom is your avatar, name, role, a theme toggle, and a <b>Sign Out</b> button."),
        bullet("A small chevron on the right edge of the sidebar collapses it into an icon-only rail — click it again to expand. Your preference is remembered on your device."),
        h3("Top area"),
        bullet("Every module shows an <b>eyebrow</b> label (e.g., \"PROJECT PLANNING\") above the page title so you always know where you are."),
        bullet("Primary actions (New Project, Create Estimate, Add Client) sit on the top-right of the page."),
        h3("Main content"),
        bullet("<b>KPI cards</b> summarise the most important numbers for the page (project counts, credits, debits, etc.). Their values auto-fit — even ₹99,99,99,999 fits on one line."),
        bullet("<b>Tables</b> are optimised for scanning: uppercase eyebrow headers, tabular numerals, hover highlighting."),
        bullet("<b>Chip badges</b> (Active, Completed, Onhold, Pending) use consistent colours across the whole product — green for good, amber for attention, rose for problems."),
        h3("On a mobile device"),
        body("The sidebar collapses into a drawer. A hamburger menu on the top-left opens it. KPI cards become a horizontal swipe row, and dense tables reflow into readable card stacks. Site Engineers get a floating <b>+ Add Employee</b> button on Field Ops so daily attendance is a one-thumb tap."),
    ]


def sec_dashboard():
    return [
        PageBreak(),
        eyebrow("Chapter 04 · Command Center"),
        h1("Dashboard"),
        role_badge_row(["Admin", "SiteEngineer", "Accountant", "ProcurementOfficer", "Client"]),
        body("The Dashboard is your daily starting point — a bird's-eye view of the whole business."),
        h3("What you see"),
        kv_table([
            ("KPI row", "Total Projects · Ongoing · Completed · With Issues · Total Budget. Click any card to filter the project list by that status."),
            ("Overall Portfolio Progress", "A donut showing the average completion across all your projects, plus a count of finished vs in-flight."),
            ("Projects by Status", "Horizontal bars comparing Planning / Ongoing / OnHold / Completed / Cancelled counts."),
            ("Projects by Stage", "Vertical bars showing where projects stand across construction phases (Site Prep · Earthwork · Structure · Completed etc.)."),
            ("Project Timeline (Gantt)", "A month-scale Gantt with a red <b>TODAY</b> marker so you spot at-risk projects instantly."),
            ("Milestone Tracker", "Upcoming, pending, and overdue milestones across all projects, grouped and sorted by due date."),
        ]),
        callout("<b>Tip:</b> Clicking a KPI card highlights it and filters everything below to that status. Click it again to clear."),
    ]


def sec_projects():
    return [
        PageBreak(),
        eyebrow("Chapter 05 · Projects"),
        h1("Managing Projects"),
        role_badge_row(["Admin", "SiteEngineer", "Accountant", "ProcurementOfficer", "Client"]),
        body("Everything in Sitera is organised around <b>projects</b>. Each project has its own team, budget, phases, ledger, and documents."),
        h2("Projects List"),
        h3("Create a new project"),
        step_table([
            "Click <b>+ NEW PROJECT</b> on the top-right.",
            "Fill in project name, location, client, site engineer, planned start/end dates, and budget.",
            "Choose a project type (Residential, Commercial, Infrastructure) if applicable.",
            "Click <b>Create</b>. The project appears in the list with status <i>Planning</i>.",
        ]),
        h3("Filtering & searching"),
        bullet("Use the search box to filter by project name."),
        bullet("Use the <b>All Clients</b>, <b>All Statuses</b>, and <b>All Engineers</b> dropdowns to narrow the list."),
        bullet("Click a KPI card (Total, Ongoing, Completed, With Issues) to filter by that status."),
        bullet("Click any project row (or card on mobile) to open its detail page."),
        h2("Project Detail — Tabs"),
        body("Every project has six tabs, each responsible for a specific slice of the workflow."),
        kv_table([
            ("Overview", "Snapshot: budget, client, engineer, planned/actual dates. Overall completion bar changes colour by progress state."),
            ("Phases", "Break the project into phases (Foundation, Framing, Finishing…). Each phase has a start, end, percent complete, status, and its own team. Marking a phase Completed auto-locks its percentage at 100."),
            ("Tracking", "Site engineers post progress updates with photos and issues. Admins see the full log."),
            ("Change Orders", "Formal variations to the contract — additions, deductions, revisions. Each Change Order has its own approval and payment status."),
            ("Employees", "The crew on this project. Employees can be scoped to specific phases; the system prevents double-assignment across projects."),
            ("Balance Sheet", "The project's full accounting ledger — see Chapter 07."),
        ]),
        callout("<b>Role note:</b> Clients see the Overview, Phases, and Tracking tabs only — everything else is admin/staff-only."),
    ]


def sec_field_ops():
    return [
        PageBreak(),
        eyebrow("Chapter 06 · Field Operations"),
        h1("Site Engineer Portal"),
        role_badge_row(["Admin", "SiteEngineer", "Client"]),
        body("The Field Ops screen is designed for on-site use on a mobile phone. It has three jobs: mark attendance, record labour payments, and manage the employee register."),
        h2("Marking Daily Attendance"),
        step_table([
            "Open <b>Field Ops</b> from the sidebar (or the drawer on mobile).",
            "Select the <b>Project</b> for which you are marking attendance.",
            "The <b>Date</b> defaults to today. Site engineers can back-date up to 3 days; admins can pick any date.",
            "For each employee card, tap <b>P</b> (Present), <b>A</b> (Absent), or <b>HD</b> (Half Day).",
            "The summary bar at the top shows <i>X of Y marked</i> in real time.",
        ]),
        h2("Adding a New Employee"),
        step_table([
            "On desktop, click <b>+ Add Employee</b>. On mobile, tap the floating <b>+ Add Employee</b> button at the bottom-right.",
            "Enter name, trade (Mason, Carpenter, Electrician…), daily wage, and wage type.",
            "Optionally assign a category (permanent vs contract) and phase.",
            "Save. The employee now appears in the attendance list.",
        ]),
        callout("<b>Wage impact:</b> Every P is a full wage, HD is half, A is zero. The unpaid balance shows up automatically on the project's Balance Sheet as labour dues."),
        h2("Recording a Labour Payment"),
        body("When you pay a labourer against their attendance, open the employee card, tap <b>Pay</b>, enter the amount, and confirm. The payment reduces their outstanding wage and is recorded as a debit on the project ledger."),
    ]


def sec_finance():
    return [
        PageBreak(),
        eyebrow("Chapter 07 · Finance"),
        h1("Finance Module"),
        role_badge_row(["Admin", "Accountant"]),
        body("The Finance module gives you both an <b>organisation-wide</b> view (all projects rolled up) and a <b>per-project</b> Balance Sheet."),
        h2("How Money Enters the Ledger"),
        body("Sitera captures money on two tracks — a fast <b>Direct Ledger</b> (Add Income / Add Expense) and a formal <b>Documents</b> track (Invoices, Payments, Payroll). Both feed the same Balance Sheet, so every credit and every debit is counted exactly once."),
        h3("Add Income (Credit)"),
        step_table([
            "Go to a project and open the <b>Balance Sheet</b> tab, or use the Finance page.",
            "Click <b>Add Income</b>.",
            "Choose the project, enter the amount, payment type (BankTransfer, Cheque, UPI, Cash…), and an optional phase.",
            "Save. Sitera does two things automatically — records the credit AND generates a Paid invoice (INV-YY-NNN) linked to that same transaction. No double-counting.",
        ]),
        h3("Add Expense (Debit)"),
        step_table([
            "On the project's Balance Sheet, click <b>Add Expense</b>.",
            "Choose the category (Cement, Steel, Fuel, Miscellaneous…), enter amount, phase, and description.",
            "Save. The debit appears immediately in the ledger with a PYMT-### voucher number.",
        ]),
        h2("Payroll — Staff Salaries"),
        body("Payroll is a 3-click monthly flow."),
        step_table([
            "<b>Create the run</b> — Go to Payroll → New Run, pick a period (e.g. 1st–31st Jan). This is just a container; no money moves yet.",
            "<b>Process</b> — Click <i>Process</i>. Sitera generates a PayrollEntry for every active staff user with net_pay = their base_salary.",
            "<b>Assign to project</b> — For each entry, pick which project it should be debited against.",
            "<b>Mark paid</b> — Click <i>Mark Paid</i> as you settle each entry. Assigned entries stay on the project ledger regardless of payment status.",
        ]),
        callout("Assigning a payroll entry to a project = the debit appears on that project's ledger. Marking it paid only updates the org-level 'Required Employee Payments' dues panel."),
        h2("The Balance Sheet — a Real Accounting Ledger"),
        body("The Balance Sheet uses a standard 7-column format that any accountant will recognise:"),
        kv_table([
            ("Date", "The transaction date."),
            ("Voucher No.", "Auto-generated. RCPT-### for receipts (credits), PYMT-### for payments (debits), CO-### for change orders."),
            ("Particulars", "Description of the transaction."),
            ("Type", "A colour-coded pill — green Credit or red Debit."),
            ("Debit (Out)", "Amount if money went out. Right-aligned."),
            ("Credit (In)", "Amount if money came in. Right-aligned."),
            ("Balance", "Running total after this row."),
        ]),
        body("The <b>first row</b> is always <i>Opening Balance b/f</i> (0 if there's no prior history). The <b>last row</b> is always <i>Totals / Closing Balance c/f</i> summing debits, credits, and closing balance. Balances that go negative are shown in red with parentheses, e.g. (₹700.00). Everything is rounded to 2 decimals and formatted with Indian commas (₹13,99,300.00)."),
        h3("Where the Money is Going — Breakdown"),
        bullet("<b>Daily-Wage Labour</b> — outstanding wages from attendance minus payments made."),
        bullet("<b>Staff Payroll</b> — total net pay of PayrollEntries assigned to this project."),
        bullet("<b>Site Expenses</b> — sum of all direct expense entries."),
        bullet("<b>Procurement Committed</b> — the value of active vendor commitments."),
        bullet("<b>Vendor Payments</b> — money already released to vendors."),
        h3("Exporting the Balance Sheet"),
        body("Click <b>Export PDF</b> or <b>Export Excel</b> on the top-right of the Balance Sheet tab. Both keep the exact 7-column ledger structure so you can share with your CA or auditor."),
    ]


def sec_estimates():
    return [
        PageBreak(),
        eyebrow("Chapter 08 · Estimates"),
        h1("Client Estimates & Approvals"),
        role_badge_row(["Admin", "Accountant", "SiteEngineer", "ProcurementOfficer"]),
        body("Estimates are pre-construction quotes you send to clients before a project starts. Once approved, an estimate can be turned into a live project with one click."),
        h2("Creating an Estimate"),
        step_table([
            "Open <b>Estimates</b> from the sidebar and click <b>+ CREATE ESTIMATE</b>.",
            "Pick the <b>Client</b>, enter a <b>Project Name</b>, <b>Phase</b>, and <b>Category</b>.",
            "Add requirement rows: description, quantity, rate. The total updates live as you type.",
            "Optionally upload a drawing (PDF or image) as a thumbnail preview.",
            "Save as Draft or send directly for approval.",
        ]),
        h2("Sending for Client Approval"),
        step_table([
            "On the estimate row, click <b>Send</b>.",
            "Confirm the client's email. Sitera sends a signed link (valid for 14 days) to the client.",
            "The status changes to <i>Sent — Awaiting Response</i>.",
        ]),
        callout("The client clicks the email link, sees a beautifully formatted quote, and clicks <b>Approve</b> or <b>Reject</b>. No login required."),
        h2("After Approval → Convert to Project"),
        step_table([
            "Approved estimates show a green <b>+ Create Project</b> button.",
            "Click it. The estimate's phases and budget carry over to a new project automatically.",
            "The estimate now links to the created project — you can hop between them.",
        ]),
        h3("Re-sending or Rejecting"),
        body("If the client didn't respond in time, click <b>Re-send</b> to issue a fresh link. If they rejected, capture the reason on the row for your records; you can then revise and re-send."),
    ]


def sec_vendors():
    return [
        PageBreak(),
        eyebrow("Chapter 09 · Vendors & Procurement"),
        h1("Managing Vendors"),
        role_badge_row(["Admin", "ProcurementOfficer", "SiteEngineer"]),
        body("Vendors are the third parties you buy materials or services from. Sitera keeps their catalogue, quotations, and payments in one place."),
        h2("Add or Edit a Vendor"),
        step_table([
            "Go to <b>Vendors</b> and click <b>+ Add Vendor</b>.",
            "Enter name, contact person, phone, email, GSTIN (if applicable), and default trade.",
            "Save. The vendor appears in the master list.",
            "To edit, click the pencil icon on the vendor's row.",
        ]),
        h2("Vendor Product Catalogue"),
        body("Each vendor has a catalogue of products they sell (with rate, unit, tax). This catalogue powers Quotations — when you request a quote, you pick from these products."),
        h2("Quotations"),
        step_table([
            "Click <b>Make Quotation</b> on a vendor's page.",
            "Add line items from the vendor's catalogue (or create ad-hoc items).",
            "Enter quantities and any negotiated rates. Totals compute automatically.",
            "Save. The quotation is stored and can be shared as PDF or converted to a Purchase Order.",
            "When you pay a vendor, record it under Vendor Payments — the debit lands on the project ledger as an outgoing payment.",
        ]),
        h3("Bid Packages"),
        body("For competitive bidding, create a <b>Bid Package</b> — a shopping list of line items — and invite multiple vendors to quote. When quotes come in, use the Bid Comparison view to see rates side-by-side and award the lowest."),
    ]


def sec_change_orders():
    return [
        PageBreak(),
        eyebrow("Chapter 10 · Change Orders"),
        h1("Change Orders (Variations)"),
        role_badge_row(["Admin", "SiteEngineer", "Accountant"]),
        body("Change Orders (COs) are formal amendments to a project's original scope or budget — extra work, deletions, or design revisions."),
        h2("Creating a Change Order"),
        step_table([
            "Open the project and switch to the <b>Change Orders</b> tab.",
            "Click <b>+ Add Change Order</b>.",
            "Choose type (Addition, Deduction, Revision), enter description, amount, and reason.",
            "Save as Draft or submit for approval.",
        ]),
        h2("The Change Order Lifecycle"),
        kv_table([
            ("Draft", "Being prepared — nothing hits the ledger yet."),
            ("Pending Approval", "Sent for client sign-off."),
            ("Approved", "Amount is added to the project's <i>revised contract value</i> and appears as a variation entry on the Balance Sheet."),
            ("Paid", "Once the client has settled the CO, mark it Paid — captures the settlement date."),
            ("Rejected", "The variation is cancelled with a stored rejection reason."),
        ]),
        callout("<b>Impact on Balance Sheet:</b> Approved change orders show up in the ledger as <i>variation</i> credits with a CO-### voucher number. The project's Total Budget card displays the revised contract value including all approved variations."),
    ]


def sec_portals():
    return [
        PageBreak(),
        eyebrow("Chapter 11 · Role Portals"),
        h1("Client, Vendor & Field Portals"),
        body("Some users don't see the admin panel at all — they get a purpose-built portal with only what they need."),
        h2("Client Portal"),
        role_badge_row(["Client"]),
        bullet("Dashboard with their own projects and progress bars."),
        bullet("Project Detail with Overview, Phases, and Tracking tabs (read-only) — no budgets or ledger visible."),
        bullet("Estimates awaiting their approval, plus a full history."),
        bullet("Invoices with paid / outstanding status."),
        h2("Vendor Portal"),
        role_badge_row(["Vendor"]),
        bullet("Dashboard listing all open bid invites from all your customers using Sitera."),
        bullet("Bid Detail with line items, submission deadline, and a form to enter unit rates."),
        bullet("A history of submitted quotations and their award status."),
        h2("Site Engineer Portal"),
        role_badge_row(["SiteEngineer"]),
        body("Same as the <b>Field Ops</b> screen described in Chapter 06. The engineer's sidebar hides finance and users; they focus on attendance and progress."),
    ]


def sec_faq():
    return [
        PageBreak(),
        eyebrow("Chapter 12 · Reference"),
        h1("Frequently Asked Questions"),
        h3("Why is the Total Credit on the Balance Sheet not matching what I expected?"),
        body("Total Credit = sum of Income Entries + sum of incoming Payments. If you recorded a client payment twice (once as an Income and once as a Payment against an invoice), it will show up twice. The auto-invoice feature (Chapter 07) prevents this for new entries; older data may need a one-time clean-up."),
        h3("A staff payroll amount doesn't appear on my project's Balance Sheet."),
        body("PayrollEntries only appear on a project's ledger when their <b>project_id</b> is assigned. After Processing a payroll run, remember to assign each entry to its project."),
        h3("The client can't open the estimate approval link."),
        body("Approval links expire after 14 days. Ask an admin to click <b>Re-send</b> on the estimate row — this issues a new link and resets the state to Pending."),
        h3("I collapsed the sidebar and want it back."),
        body("Click the chevron on the sidebar's right edge to expand it again. On mobile, use the hamburger button on the top-left."),
        h3("How do I switch between light and dark themes?"),
        body("Bottom-left of the sidebar (sun/moon icon). Your preference is remembered on your device."),
        h3("I forgot my password."),
        body("Contact your Sitera administrator. They can generate a fresh password from Users → Reset Password."),
        Spacer(1, 8),
        h2("Support"),
        callout("For help, please contact your Sitera administrator or reach out to Sitera support at "
                "<b>support@sitera.in</b>. This manual is versioned; check with your admin for the latest revision."),
    ]


def toc():
    lines = [
        ("01", "Introduction"),
        ("02", "Getting Started"),
        ("03", "Navigating Sitera"),
        ("04", "Command Center · Dashboard"),
        ("05", "Managing Projects"),
        ("06", "Field Operations"),
        ("07", "Finance"),
        ("08", "Estimates"),
        ("09", "Vendors & Procurement"),
        ("10", "Change Orders"),
        ("11", "Role Portals"),
        ("12", "Reference · FAQ"),
    ]
    rows = [[Paragraph(f"<font color='#F59E0B'><b>{n}</b></font>", S["body"]),
             Paragraph(title, S["toc_line"])] for n, title in lines]
    t = Table(rows, colWidths=[16 * mm, 152 * mm])
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, SLATE_100),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    return [
        eyebrow("Contents"),
        h1("Table of Contents"),
        Spacer(1, 6),
        t,
        Spacer(1, 20),
        callout("<b>How to use this manual:</b> Each chapter is self-contained. Jump to whichever role or module is relevant to your day-to-day. Watch for the coloured role pills at the top of each chapter — they tell you which users can access what."),
    ]


def build_manual(output_path):
    story = []
    # Cover
    story.extend(build_cover())
    story.append(PageBreak())
    story.append(PageBreak())  # switch to Body template — done via NextPageTemplate below
    # (The trick: BaseDocTemplate uses last-added template on next page)

    # Body pages
    story.extend(toc())
    story.extend(sec_intro())
    story.extend(sec_getting_started())
    story.extend(sec_layout())
    story.extend(sec_dashboard())
    story.extend(sec_projects())
    story.extend(sec_field_ops())
    story.extend(sec_finance())
    story.extend(sec_estimates())
    story.extend(sec_vendors())
    story.extend(sec_change_orders())
    story.extend(sec_portals())
    story.extend(sec_faq())

    doc = ManualDoc(output_path)
    # Switch template after cover
    from reportlab.platypus.doctemplate import NextPageTemplate
    story_final = build_cover() + [NextPageTemplate("Body"), PageBreak()] \
        + toc() + sec_intro() + sec_getting_started() + sec_layout() \
        + sec_dashboard() + sec_projects() + sec_field_ops() + sec_finance() \
        + sec_estimates() + sec_vendors() + sec_change_orders() + sec_portals() \
        + sec_faq()
    doc.build(story_final)


if __name__ == "__main__":
    out = Path("/app/docs")
    out.mkdir(parents=True, exist_ok=True)
    pdf_path = out / "Sitera_User_Manual.pdf"
    build_manual(pdf_path)
    print(f"✅ Generated {pdf_path}  ({pdf_path.stat().st_size / 1024:.1f} KB)")
