import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(request: NextRequest) {
    try {
        const { to, subject, body } = await request.json();

        if (!to || !subject) {
            return NextResponse.json({ error: "to and subject are required" }, { status: 400 });
        }

        const { data, error } = await resend.emails.send({
            from: "onboarding@resend.dev",
            to,
            subject,
            html: `<p>${body.replace(/\n/g, "<br>")}</p>`,
        });

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        return NextResponse.json({
            sent: true,
            id: data?.id,
            to,
            subject,
            sentAt: new Date().toISOString(),
        });
    } catch (error: any) {
        console.error("Send email error:", error);
        return NextResponse.json(
            { error: error.message || "Email send failed" },
            { status: 500 }
        );
    }
}