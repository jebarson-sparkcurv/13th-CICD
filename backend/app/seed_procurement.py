from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models import User
from app.models.procurement import (Vendor, PurchaseOrder, POLineItem, Subcontract,
                                    ChangeOrder, PayApplication, PayApplicationLineItem,
                                    LienWaiver, MaterialDelivery, BidPackage, BidInvitation,
                                    Bid, CostCodeBudget)


def seed_procurement(db: Session):
    if db.query(Vendor).count() > 0:
        return
    today = date.today()
    admin = db.query(User).filter(User.role == "Admin").first()

    v1 = Vendor(name="Apex Steel Works", vendor_type="Subcontractor", trade="Structural Steel",
                contact_name="Vikram Rao", email="vikram@apexsteel.com", phone="+91 98111 22334",
                insurance_expiry=today + timedelta(days=200), status="Active", prequalified=True, rating=4.5)
    v2 = Vendor(name="Nova Concrete Supply", vendor_type="Supplier", trade="Concrete",
                contact_name="Meera Iyer", email="meera@novaconcrete.com", phone="+91 99887 66554",
                insurance_expiry=today + timedelta(days=20), status="Active", prequalified=True, rating=4.0)
    v3 = Vendor(name="Zenith Electricals", vendor_type="Subcontractor", trade="Electrical",
                contact_name="Farhan Ali", email="farhan@zenithelec.com", phone="+91 90000 11122",
                insurance_expiry=today - timedelta(days=10), status="Active", prequalified=False, rating=3.5)
    v4 = Vendor(name="Stratus MEP Consultants", vendor_type="Consultant", trade="MEP Design",
                contact_name="Anita Desai", email="anita@stratusmep.com", phone="+91 91234 55667",
                insurance_expiry=today + timedelta(days=365), status="Active", prequalified=True, rating=4.8)
    db.add_all([v1, v2, v3, v4]); db.flush()

    db.add_all([
        CostCodeBudget(project_id=1, cost_code="03-3000", allocated_amount=60000000),
        CostCodeBudget(project_id=1, cost_code="05-1000", allocated_amount=45000000),
        CostCodeBudget(project_id=1, cost_code="26-0000", allocated_amount=15000000),
    ])

    po1 = PurchaseOrder(project_id=1, vendor_id=v2.id, po_number="PO-1-001", cost_code="03-3000",
                        description="Ready-mix concrete supply — floors 8-14", status="Approved",
                        issue_date=today - timedelta(days=40),
                        expected_delivery_date=today + timedelta(days=30),
                        original_amount=32000000, revised_amount=33500000,
                        created_by=admin.id, approved_by=admin.id)
    po2 = PurchaseOrder(project_id=1, vendor_id=v3.id, po_number="PO-1-002", cost_code="26-0000",
                        description="Electrical rough-in materials", status="PendingApproval",
                        issue_date=today - timedelta(days=5),
                        original_amount=8200000, revised_amount=8200000, created_by=admin.id)
    sc1 = Subcontract(project_id=1, vendor_id=v1.id, contract_number="SC-1-001", cost_code="05-1000",
                      scope_of_work="Structural steel fabrication and erection, floors 1-14",
                      status="Executed", original_amount=48000000, revised_amount=48000000,
                      retainage_pct=10, start_date=today - timedelta(days=90),
                      end_date=today + timedelta(days=180), created_by=admin.id, approved_by=admin.id)
    db.add_all([po1, po2, sc1]); db.flush()

    db.add_all([
        POLineItem(purchase_order_id=po1.id, item_description="M40 ready-mix concrete", unit="m³",
                   quantity=2500, unit_price=8000, line_total=20000000, received_quantity=1400),
        POLineItem(purchase_order_id=po1.id, item_description="M30 ready-mix concrete", unit="m³",
                   quantity=1500, unit_price=8000, line_total=12000000, received_quantity=600),
        ChangeOrder(commitment_type="po", commitment_id=po1.id, co_number="CO-001",
                    reason="Additional 190 m³ for revised core walls", amount=1500000,
                    status="Approved", requested_by=admin.id, approved_by=admin.id),
        ChangeOrder(commitment_type="subcontract", commitment_id=sc1.id, co_number="CO-001",
                    reason="Extra bracing for wind load revision", amount=2200000,
                    status="Pending", requested_by=admin.id),
        MaterialDelivery(purchase_order_id=po1.id, project_id=1,
                         item_description="M40 concrete pour — 8th floor slab",
                         quantity_delivered=420, delivery_date=today - timedelta(days=12),
                         received_by=admin.id, status="Complete"),
    ])

    pa1 = PayApplication(commitment_type="subcontract", commitment_id=sc1.id, application_number=1,
                         period_start=today - timedelta(days=60), period_end=today - timedelta(days=30),
                         amount_this_period=12000000, retainage_held=1200000, amount_due=10800000,
                         status="Approved", submitted_at=None, approved_by=admin.id)
    db.add(pa1); db.flush()
    db.add_all([
        PayApplicationLineItem(pay_application_id=pa1.id, description="Steel fabrication",
                               scheduled_value=30000000, previous_completed=0, this_period=9000000,
                               materials_stored=0, pct_complete=30),
        PayApplicationLineItem(pay_application_id=pa1.id, description="Erection labour",
                               scheduled_value=18000000, previous_completed=0, this_period=3000000,
                               materials_stored=0, pct_complete=16.67),
        LienWaiver(pay_application_id=pa1.id, vendor_id=v1.id, waiver_type="ConditionalProgress",
                   amount=10800000, signed_date=today - timedelta(days=25), status="Received"),
    ])

    bp = BidPackage(project_id=1, title="Facade Glazing Package", cost_code="08-4000",
                    scope_description="Unitized curtain wall supply & install",
                    status="Open", bid_due_date=today + timedelta(days=14), created_by=admin.id)
    db.add(bp); db.flush()
    db.add_all([
        BidInvitation(bid_package_id=bp.id, vendor_id=v1.id, response_status="Submitted"),
        BidInvitation(bid_package_id=bp.id, vendor_id=v4.id, response_status="Viewed"),
        Bid(bid_package_id=bp.id, vendor_id=v1.id, amount=26500000, notes="8-week lead time",
            is_leveled=True, status="UnderReview"),
    ])
    db.commit()
