-- Defense in depth: public QR writes go through insert_public_qr_issue.
REVOKE SELECT ON TABLE public.property_issues FROM anon;
