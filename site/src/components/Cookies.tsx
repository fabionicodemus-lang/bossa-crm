"use client";
import Script from "next/script";
import Link from "next/link";
import { useEffect, useState } from "react";
import { consentimento, definirConsentimento, type Consentimento } from "@/lib/rastreio";

const GA = process.env.NEXT_PUBLIC_GA4_ID;
const META = process.env.NEXT_PUBLIC_META_PIXEL_ID;
const CLARITY = process.env.NEXT_PUBLIC_CLARITY_ID;

/** Banner de cookies e carregamento de GA4, Meta Pixel e Clarity só depois do aceite. */
export function Cookies() {
  const [estado, setEstado] = useState<Consentimento | "carregando">("carregando");
  useEffect(() => {
    setEstado(consentimento());
    const f = (e: Event) => setEstado((e as CustomEvent).detail);
    addEventListener("bossa:consentimento", f);
    return () => removeEventListener("bossa:consentimento", f);
  }, []);
  if (estado === "carregando") return null;
  return (
    <>
      {estado === null && (
        <div className="cookies" role="region" aria-label="Cookies">
          <p>Usamos cookies para entender como o site é usado e melhorar o atendimento. Os de publicidade só são ativados se você aceitar. <Link href="/privacidade">Saiba mais</Link>.</p>
          <div className="linha-acoes">
            <button className="botao" onClick={() => definirConsentimento("todos")}>Aceitar todos</button>
            <button className="botao botao--contorno" onClick={() => definirConsentimento("necessarios")}>Só os necessários</button>
          </div>
        </div>
      )}
      {estado === "todos" && GA && (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA}`} strategy="afterInteractive" />
          <Script id="ga4" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;gtag('js',new Date());gtag('config','${GA}',{anonymize_ip:true});`}</Script>
        </>
      )}
      {estado === "todos" && META && (
        <Script id="meta" strategy="afterInteractive">{`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META}');fbq('track','PageView');`}</Script>
      )}
      {estado === "todos" && CLARITY && (
        <Script id="clarity" strategy="afterInteractive">{`(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window,document,"clarity","script","${CLARITY}");`}</Script>
      )}
    </>
  );
}
