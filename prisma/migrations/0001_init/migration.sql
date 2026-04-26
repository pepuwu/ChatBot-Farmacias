--
-- PostgreSQL database dump
--

-- Dumped from database version 18.3 (Debian 18.3-1.pgdg13+1)
-- Dumped by pg_dump version 18.3 (Homebrew)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
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

