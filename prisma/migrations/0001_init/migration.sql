--
-- PostgreSQL database dump
--

-- Dumped from database version 18.3 (Debian 18.3-1.pgdg13+1)
-- Dumped by pg_dump version 18.3 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: Admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Admin" (
    id text NOT NULL,
    "whatsappNumber" text NOT NULL,
    nombre text DEFAULT ''::text NOT NULL,
    "farmaciaId" text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Cliente" (
    id text NOT NULL,
    "farmaciaId" text NOT NULL,
    telefono text NOT NULL,
    nombre text DEFAULT ''::text NOT NULL,
    "ultimaInteraccion" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Conversacion; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Conversacion" (
    id text NOT NULL,
    "clienteId" text NOT NULL,
    "farmaciaId" text NOT NULL,
    estado text DEFAULT 'bot'::text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: Farmacia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Farmacia" (
    id text NOT NULL,
    nombre text NOT NULL,
    "whatsappNumber" text NOT NULL,
    direccion text DEFAULT ''::text NOT NULL,
    horarios jsonb DEFAULT '{}'::jsonb NOT NULL,
    delivery boolean DEFAULT true NOT NULL,
    "zonaDelivery" text DEFAULT ''::text NOT NULL,
    "obrasSociales" text[] DEFAULT ARRAY[]::text[],
    servicios text[] DEFAULT ARRAY[]::text[],
    "promptSistema" text,
    "mensajeBienvenida" text DEFAULT ''::text NOT NULL,
    "mensajeDerivacion" text DEFAULT 'Para eso te comunico con nuestro farmacéutico.'::text NOT NULL,
    "tiempoSesionMinutos" integer DEFAULT 10 NOT NULL,
    activa boolean DEFAULT true NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" timestamp(3) without time zone NOT NULL
);


--
-- Name: ListaEspera; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."ListaEspera" (
    id text NOT NULL,
    "farmaciaId" text NOT NULL,
    "clienteId" text NOT NULL,
    producto text NOT NULL,
    notificado boolean DEFAULT false NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Name: Mensaje; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public."Mensaje" (
    id text NOT NULL,
    "conversacionId" text NOT NULL,
    role text NOT NULL,
    contenido text NOT NULL,
    "createdAt" timestamp(3) without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);


--
-- Data for Name: Admin; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Admin" (id, "whatsappNumber", nombre, "farmaciaId", "createdAt") FROM stdin;
cmo9lkpyq000lxhc7a2bkxnb3	5492944340983	Pepo	cmo9fjjwq0000yk71qhjpocvz	2026-04-22 05:13:40.466
\.


--
-- Data for Name: Cliente; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Cliente" (id, "farmaciaId", telefono, nombre, "ultimaInteraccion") FROM stdin;
cmo9lceup000dxhc701xkqmwz	cmo9fjjwq0000yk71qhjpocvz	237379319259173	237379319259173	2026-04-22 05:07:12.817
cmo9l5mv30001xhc7fvoz1kjn	cmo9fjjwq0000yk71qhjpocvz	11493382815865	11493382815865	2026-04-22 05:22:17.643
cmo9m8ex10001fazoyon57edl	cmo9fjjwq0000yk71qhjpocvz	5492944340983	5492944340983	2026-04-24 02:05:01.123
\.


--
-- Data for Name: Conversacion; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Conversacion" (id, "clienteId", "farmaciaId", estado, "createdAt", "updatedAt") FROM stdin;
cmo9l5mvi0003xhc7hy21so8c	cmo9l5mv30001xhc7fvoz1kjn	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-22 05:01:56.622	2026-04-22 05:17:34.227
cmo9lceuw000fxhc7s6d8g712	cmo9lceup000dxhc701xkqmwz	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-22 05:07:12.824	2026-04-22 05:17:34.227
cmo9lvt0z000nxhc7lgid5135	cmo9l5mv30001xhc7fvoz1kjn	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-22 05:22:17.652	2026-04-22 05:32:36.184
cmo9m8exc0003fazo09maervv	cmo9m8ex10001fazoyon57edl	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-22 05:32:05.905	2026-04-22 05:44:20.657
cmo9mr9ph0001r2h37kn8h68b	cmo9m8ex10001fazoyon57edl	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-22 05:46:45.606	2026-04-22 06:11:58.511
cmoabpmn90005jbma4mw95vi0	cmo9m8ex10001fazoyon57edl	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-22 17:25:19.462	2026-04-22 17:35:46.873
cmoc2tcqm000bjbma6th6xqd8	cmo9m8ex10001fazoyon57edl	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-23 22:51:49.055	2026-04-23 23:05:06.834
cmoc5gvzg001hjbma11rdc6ik	cmo9m8ex10001fazoyon57edl	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-24 00:06:06.317	2026-04-24 00:25:15.677
cmoc6btya00018xpxm9ke8x2c	cmo9m8ex10001fazoyon57edl	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-24 00:30:10.019	2026-04-24 00:40:14.931
cmoc9pez800078xpxhb8zpgaf	cmo9m8ex10001fazoyon57edl	cmo9fjjwq0000yk71qhjpocvz	cerrada	2026-04-24 02:04:42.644	2026-04-24 02:15:14.251
\.


--
-- Data for Name: Farmacia; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Farmacia" (id, nombre, "whatsappNumber", direccion, horarios, delivery, "zonaDelivery", "obrasSociales", servicios, "promptSistema", "mensajeBienvenida", "mensajeDerivacion", "tiempoSesionMinutos", activa, "createdAt", "updatedAt") FROM stdin;
cmo9fjjwq0000yk71qhjpocvz	Farmacia Juancito	541131893197	Palermo	{"sabado": "9:00 a 14:00", "semana": "Lunes a Viernes 8:00 a 20:00", "domingo": "Cerrado"}	t		{}	{}	\N		Para eso te comunico con nuestro farmacéutico.	10	t	2026-04-22 02:24:48.265	2026-04-22 02:24:48.265
\.


--
-- Data for Name: ListaEspera; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."ListaEspera" (id, "farmaciaId", "clienteId", producto, notificado, "createdAt") FROM stdin;
\.


--
-- Data for Name: Mensaje; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public."Mensaje" (id, "conversacionId", role, contenido, "createdAt") FROM stdin;
cmo9l5mvw0005xhc72pi6h0lg	cmo9l5mvi0003xhc7hy21so8c	user	hola	2026-04-22 05:01:56.637
cmo9l5o670007xhc78jxce7hp	cmo9l5mvi0003xhc7hy21so8c	assistant	¡Hola! Bienvenido a Farmacia Juancito 👋\n\n¿En qué te puedo ayudar?  \n1️⃣ Horarios y ubicación  \n2️⃣ Consulta de medicamentos  \n3️⃣ Delivery  \n4️⃣ Obras sociales aceptadas  \n5️⃣ Hablar con el farmacéutico\n\nEscribime lo que necesitás 🙂	2026-04-22 05:01:58.304
cmo9lc6vz0009xhc7vdysn6c2	cmo9l5mvi0003xhc7hy21so8c	user	h	2026-04-22 05:07:02.496
cmo9lc8sa000bxhc7cxn561y2	cmo9l5mvi0003xhc7hy21so8c	assistant	¡Hola! ¿En qué te puedo ayudar hoy?	2026-04-22 05:07:04.954
cmo9lcev0000hxhc7xmfzi29z	cmo9lceuw000fxhc7s6d8g712	user	Hola	2026-04-22 05:07:12.828
cmo9lcg93000jxhc7pc4ihrvu	cmo9lceuw000fxhc7s6d8g712	assistant	¡Hola! Bienvenido a Farmacia Juancito 👋\n\n¿En qué te puedo ayudar?\n1️⃣ Horarios y ubicación\n2️⃣ Consulta de medicamentos\n3️⃣ Delivery\n4️⃣ Obras sociales aceptadas\n5️⃣ Hablar con el farmacéutico\n\nEscribime lo que necesitás 🙂	2026-04-22 05:07:14.631
cmo9lvt13000pxhc7yp4i5l2o	cmo9lvt0z000nxhc7lgid5135	user	aloj	2026-04-22 05:22:17.656
cmo9lvtzv000rxhc78bfx81ws	cmo9lvt0z000nxhc7lgid5135	assistant	¡Hola! No entiendo bien tu mensaje, ¿querés consultar algo sobre un medicamento o producto? Respondé y te ayudo.	2026-04-22 05:22:18.907
cmo9m8exi0005fazodbdnvm14	cmo9m8exc0003fazo09maervv	user	hola	2026-04-22 05:32:05.911
cmo9m8fxo0007fazovbrqrzob	cmo9m8exc0003fazo09maervv	assistant	¡Hola! Bienvenido a Farmacia Juancito 👋\n\n¿En qué te puedo ayudar?\n1️⃣ Horarios y ubicación\n2️⃣ Consulta de medicamentos\n3️⃣ Delivery\n4️⃣ Obras sociales aceptadas\n5️⃣ Hablar con el farmacéutico\n\nEscribime lo que necesitás 🙂	2026-04-22 05:32:07.212
cmo9m8ug00009fazo7pmci5db	cmo9m8exc0003fazo09maervv	user	1	2026-04-22 05:32:26.016
cmo9m8vf8000bfazoqnaio3g0	cmo9m8exc0003fazo09maervv	assistant	Estamos abiertos de lunes a viernes de 8:00 a 20:00, los sábados de 9:00 a 14:00 y los domingos cerrados.  \n¿Querés que te pase la dirección o alguna otra info?	2026-04-22 05:32:27.285
cmo9m9e9w000dfazoyocwyg5h	cmo9m8exc0003fazo09maervv	user	pastillas anticonceptivas	2026-04-22 05:32:51.717
cmo9m9eqq000ffazopsmr76cu	cmo9m8exc0003fazo09maervv	assistant	Claro, ¿querés saber sobre alguna marca en especial o te gustaría que te avise cuando tengamos stock?	2026-04-22 05:32:52.322
cmo9m9k33000hfazornfsd0w5	cmo9m8exc0003fazo09maervv	user	todas las marcas	2026-04-22 05:32:59.247
cmo9m9ksa000jfazopuy1ecas	cmo9m8exc0003fazo09maervv	assistant	Tenemos varias marcas de pastillas anticonceptivas. ¿Querés que te avise cuando lleguen o necesitás alguna en particular?	2026-04-22 05:33:00.155
cmo9m9w9u000lfazo1gy3utfa	cmo9m8exc0003fazo09maervv	user	necesito receta?	2026-04-22 05:33:15.043
cmo9m9wme000nfazofy5lckcl	cmo9m8exc0003fazo09maervv	assistant	Sí, las pastillas anticonceptivas requieren receta médica. ¿Querés que te ayudemos a solicitarla o tenés alguna otra duda?	2026-04-22 05:33:15.494
cmo9ma5v5000pfazosa84kagk	cmo9m8exc0003fazo09maervv	user	quiero que me contactes con el farmaceutico	2026-04-22 05:33:27.474
cmo9ma6hh000rfazobkgd9jzf	cmo9m8exc0003fazo09maervv	assistant	Para eso te comunico con nuestro farmacéutico. Por favor, aguardá un momento.	2026-04-22 05:33:28.277
cmo9mr9pl0003r2h3trq9wln8	cmo9mr9ph0001r2h37kn8h68b	user	quiero que me envíen ibuprofeno a domicilio	2026-04-22 05:46:45.61
cmo9mranf0005r2h3elqby66w	cmo9mr9ph0001r2h37kn8h68b	assistant	Hola! En Farmacia Juancito contamos con delivery, pero en zona todavía no lo tenemos activado. ¿Querés que te avisemos cuando esté disponible?	2026-04-22 05:46:46.827
cmo9mrpap0007r2h3z9k3pri9	cmo9mr9ph0001r2h37kn8h68b	user	no entendi con “en zona”	2026-04-22 05:47:05.81
cmo9mrq0m0009r2h3ow9jcwo9	cmo9mr9ph0001r2h37kn8h68b	assistant	Perdón, quise decir que todavía no ofrecemos delivery en tu zona. ¿Querés que te avise cuando podamos?	2026-04-22 05:47:06.743
cmo9mrz1w000br2h3y3gd2svw	cmo9mr9ph0001r2h37kn8h68b	user	por donde ofrecen delivery?	2026-04-22 05:47:18.453
cmo9mrzh4000dr2h37o0k99ce	cmo9mr9ph0001r2h37kn8h68b	assistant	Hola, actualmente el delivery está disponible en algunas zonas, pero no puedo especificar cuáles. ¿Querés que te informemos cuando llegue a tu zona?	2026-04-22 05:47:19.001
cmo9mzuak0001q2tc3jpm9xut	cmo9mr9ph0001r2h37kn8h68b	user	hola	2026-04-22 05:53:25.533
cmo9mzupe0003q2tcn95ettpi	cmo9mr9ph0001r2h37kn8h68b	assistant	¡Hola! ¿En qué puedo ayudarte hoy?	2026-04-22 05:53:26.066
cmo9n01me0005q2tcxsgh5fqu	cmo9mr9ph0001r2h37kn8h68b	user	en que podes ayudarme	2026-04-22 05:53:35.03
cmo9n01zj0007q2tcjztrlwfa	cmo9mr9ph0001r2h37kn8h68b	assistant	Hola! Puedo ayudarte con consultas sobre productos, disponibilidad, horarios y si querés que te avisemos cuando tengamos algo en stock. ¿En qué necesitas mano?	2026-04-22 05:53:35.504
cmo9n5by7000166p3wszx3vx4	cmo9mr9ph0001r2h37kn8h68b	user	hola	2026-04-22 05:57:41.696
cmo9n5c91000366p3haeu6n03	cmo9mr9ph0001r2h37kn8h68b	assistant	¡Hola! ¿En qué puedo ayudarte hoy?	2026-04-22 05:57:42.085
cmo9naimr0001jbmanyun3c14	cmo9mr9ph0001r2h37kn8h68b	user	hola	2026-04-22 06:01:43.636
cmo9najjr0003jbmaef66zfvv	cmo9mr9ph0001r2h37kn8h68b	assistant	¡Hola! ¿En qué puedo ayudarte hoy?	2026-04-22 06:01:44.823
cmoabpmnd0007jbmabjpdvhe7	cmoabpmn90005jbma4mw95vi0	user	Hola	2026-04-22 17:25:19.466
cmoabpntn0009jbmanzuiqrd2	cmoabpmn90005jbma4mw95vi0	assistant	¡Hola! ¿En qué puedo ayudarte hoy?	2026-04-22 17:25:20.988
cmoc2tcqr000djbma4aav4m89	cmoc2tcqm000bjbma6th6xqd8	user	buenas	2026-04-23 22:51:49.059
cmoc2tdye000fjbmaa7c8tp2u	cmoc2tcqm000bjbma6th6xqd8	assistant	Hola, ¿en qué puedo ayudarte?	2026-04-23 22:51:50.631
cmoc2vg86000hjbmaj3y4ishq	cmoc2tcqm000bjbma6th6xqd8	user	hasta que hora abren?	2026-04-23 22:53:26.887
cmoc2vh2p000jjbmawybj79wu	cmoc2tcqm000bjbma6th6xqd8	assistant	Hoy estamos abiertos hasta las 20:00. ¿Necesitás algo en particular?	2026-04-23 22:53:27.985
cmoc2vlni000ljbmaljwxdmgk	cmoc2tcqm000bjbma6th6xqd8	user	¿tienen ibuprofeno?	2026-04-23 22:53:33.918
cmoc2vmpq000njbma686130pd	cmoc2tcqm000bjbma6th6xqd8	assistant	Sí, contamos con ibuprofeno. ¿Querés que te avisemos cuando llegue o necesitás algo más?	2026-04-23 22:53:35.295
cmoc2vvw0000pjbmak887woet	cmoc2tcqm000bjbma6th6xqd8	user	un clonazepam	2026-04-23 22:53:47.185
cmoc2vwga000rjbmar23qehg3	cmoc2tcqm000bjbma6th6xqd8	assistant	Lo siento, pero no puedo ayudarte con eso. Para eso te comunico con nuestro farmacéutico. ¿Querés algo más?	2026-04-23 22:53:47.914
cmoc2w5om000tjbmar9esind4	cmoc2tcqm000bjbma6th6xqd8	user	me quedo solo con el ibuprofeno	2026-04-23 22:53:59.878
cmoc2w6gy000vjbma1nitr27k	cmoc2tcqm000bjbma6th6xqd8	assistant	Perfecto. Si necesitás algo más, avísame. ¡Que tengas buen día!	2026-04-23 22:54:00.898
cmoc2wevk000xjbmaynb9fdm8	cmoc2tcqm000bjbma6th6xqd8	user	¿aceptan OSDE?	2026-04-23 22:54:11.792
cmoc2wfad000zjbmajfrvkw0i	cmoc2tcqm000bjbma6th6xqd8	assistant	Consultá si aceptamos OSDE directamente, o si podemos hacer la autorización. ¿Querés que averigüe por vos?	2026-04-23 22:54:12.325
cmoc2wnlf0011jbmaez45t0r2	cmoc2tcqm000bjbma6th6xqd8	user	si porfa	2026-04-23 22:54:23.091
cmoc2wp0v0013jbmajdj6xxyv	cmoc2tcqm000bjbma6th6xqd8	assistant	Lamentablemente, no tengo esa información en este momento. Te recomiendo que llames o te acerques a la farmacia para confirmar si aceptamos OSDE. ¿Querés que te pase el número para consultar?	2026-04-23 22:54:24.943
cmoc2wunv0015jbmav81npg5x	cmoc2tcqm000bjbma6th6xqd8	user	dale	2026-04-23 22:54:32.251
cmoc2wv8l0017jbmait575uvt	cmoc2tcqm000bjbma6th6xqd8	assistant	Claro, el número de la farmacia es [inserta número]. ¿Hay algo más en lo que pueda ayudarte?	2026-04-23 22:54:32.997
cmoc2x4xo0019jbmaflxutccv	cmoc2tcqm000bjbma6th6xqd8	user	tengo dolor de cabeza, qué me recomendás?	2026-04-23 22:54:45.564
cmoc2x5et001bjbmacleilj87	cmoc2tcqm000bjbma6th6xqd8	assistant	Para eso te comunico con nuestro farmacéutico. ¿Querés que te pase con él?	2026-04-23 22:54:46.181
cmoc2xaqp001djbma733w8ie5	cmoc2tcqm000bjbma6th6xqd8	user	tengo diabetes y quiero saber si puedo tomar ibuprofeno	2026-04-23 22:54:53.089
cmoc2xb6a001fjbma6kp3tw8u	cmoc2tcqm000bjbma6th6xqd8	assistant	Para eso te comunico con nuestro farmacéutico. ¿Querés que te pase con él?	2026-04-23 22:54:53.651
cmoc5gvzk001jjbma0cdiv10p	cmoc5gvzg001hjbma11rdc6ik	user	¿aceptan OSDE?	2026-04-24 00:06:06.32
cmoc5gxal001ljbma06d45t1v	cmoc5gvzg001hjbma11rdc6ik	assistant	Hola, en Farmacia Juancito consultamos las obras sociales, pero te recomiendo que llames o pasés por la farmacia para confirmarlo. ¿Querés que te avise si lo conseguimos?	2026-04-24 00:06:08.014
cmoc5s9zs001njbmag01tsqer	cmoc5gvzg001hjbma11rdc6ik	user	aceptan mossdam y vos?	2026-04-24 00:14:57.688
cmoc5sb6r001pjbmab0lvh8oa	cmoc5gvzg001hjbma11rdc6ik	assistant	Hola. Aceptamos algunas obras sociales, pero tendrías que consultarlo directamente con nosotros para confirmarlo. ¿Querés que te avise cuando lo tengamos disponible?	2026-04-24 00:14:59.235
cmoc5sh72001rjbmavq4lf25c	cmoc5gvzg001hjbma11rdc6ik	user	decime todas las que acpetan	2026-04-24 00:15:07.023
cmoc5shym001tjbma8n9vblhd	cmoc5gvzg001hjbma11rdc6ik	assistant	Hola, en Farmacia Juancito trabajamos con varias obras sociales, pero no tengo la lista completa en este momento. Te recomiendo que te pases por la farmacia o nos llames para que te confirmemos. ¿Querés que te avise cuando tengamos la información?	2026-04-24 00:15:08.015
cmoc6btyf00038xpxxclngz85	cmoc6btya00018xpxm9ke8x2c	user	aceptan osde?	2026-04-24 00:30:10.024
cmoc6bueq00058xpxgy64t3p4	cmoc6btya00018xpxm9ke8x2c	assistant	No tengo esa info cargada, consultá directamente con nuestro farmacéutico.	2026-04-24 00:30:10.61
cmoc9pezc00098xpxyi70bx9v	cmoc9pez800078xpxhb8zpgaf	user	hola	2026-04-24 02:04:42.649
cmoc9pg0i000b8xpx51z8gzvz	cmoc9pez800078xpxhb8zpgaf	assistant	¡Hola! ¿En qué puedo ayudarte hoy?	2026-04-24 02:04:43.987
cmoc9pt8p000d8xpxfp83cfkq	cmoc9pez800078xpxhb8zpgaf	user	queria un ibuprofeno 550	2026-04-24 02:05:01.13
cmoc9puzp000f8xpxt04xjqwb	cmoc9pez800078xpxhb8zpgaf	assistant	Claro, tenemos ibuprofeno 600 mg de venta libre, ¿quieres que te lo prepare? ¿Lo separo para que pases o te lo enviamos por delivery?	2026-04-24 02:05:03.397
\.


--
-- Name: Admin Admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Admin"
    ADD CONSTRAINT "Admin_pkey" PRIMARY KEY (id);


--
-- Name: Cliente Cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Cliente"
    ADD CONSTRAINT "Cliente_pkey" PRIMARY KEY (id);


--
-- Name: Conversacion Conversacion_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Conversacion"
    ADD CONSTRAINT "Conversacion_pkey" PRIMARY KEY (id);


--
-- Name: Farmacia Farmacia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Farmacia"
    ADD CONSTRAINT "Farmacia_pkey" PRIMARY KEY (id);


--
-- Name: ListaEspera ListaEspera_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ListaEspera"
    ADD CONSTRAINT "ListaEspera_pkey" PRIMARY KEY (id);


--
-- Name: Mensaje Mensaje_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Mensaje"
    ADD CONSTRAINT "Mensaje_pkey" PRIMARY KEY (id);


--
-- Name: Admin_whatsappNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Admin_whatsappNumber_key" ON public."Admin" USING btree ("whatsappNumber");


--
-- Name: Cliente_farmaciaId_telefono_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Cliente_farmaciaId_telefono_key" ON public."Cliente" USING btree ("farmaciaId", telefono);


--
-- Name: Conversacion_clienteId_updatedAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Conversacion_clienteId_updatedAt_idx" ON public."Conversacion" USING btree ("clienteId", "updatedAt");


--
-- Name: Conversacion_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Conversacion_estado_idx" ON public."Conversacion" USING btree (estado);


--
-- Name: Farmacia_whatsappNumber_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX "Farmacia_whatsappNumber_key" ON public."Farmacia" USING btree ("whatsappNumber");


--
-- Name: ListaEspera_farmaciaId_notificado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "ListaEspera_farmaciaId_notificado_idx" ON public."ListaEspera" USING btree ("farmaciaId", notificado);


--
-- Name: Mensaje_conversacionId_createdAt_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "Mensaje_conversacionId_createdAt_idx" ON public."Mensaje" USING btree ("conversacionId", "createdAt");


--
-- Name: Admin Admin_farmaciaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Admin"
    ADD CONSTRAINT "Admin_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES public."Farmacia"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Cliente Cliente_farmaciaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Cliente"
    ADD CONSTRAINT "Cliente_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES public."Farmacia"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Conversacion Conversacion_clienteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Conversacion"
    ADD CONSTRAINT "Conversacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES public."Cliente"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Conversacion Conversacion_farmaciaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Conversacion"
    ADD CONSTRAINT "Conversacion_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES public."Farmacia"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ListaEspera ListaEspera_clienteId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ListaEspera"
    ADD CONSTRAINT "ListaEspera_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES public."Cliente"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: ListaEspera ListaEspera_farmaciaId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."ListaEspera"
    ADD CONSTRAINT "ListaEspera_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES public."Farmacia"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: Mensaje Mensaje_conversacionId_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public."Mensaje"
    ADD CONSTRAINT "Mensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES public."Conversacion"(id) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict f5RtfWKu9F3BmLfRZnJSqxeVg7hulcAwcSgN9q0JxqtLLYKKuqsCN2eRtHDqxLg

