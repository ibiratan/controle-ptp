/* =========================================================
   CONTROLE DE PTP — app.js
   ========================================================= */

const STORAGE_KEY = "controle_ptp_reset_v4";
const DIAS_ANTES_AVISO_DEFAULT = 3;
const DIAS_DURACAO_PTP = 7;

/* ---------- Utilidades ---------- */

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function uid() {
  return "r_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
}

function toDate(str) {
  if (!str) return null;
  const [y, m, d] = str.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toInputDate(d) {
  if (!d) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function daysBetween(a, b) {
  if (!a || !b) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

function fmtDate(d) {
  if (!d) return "—";
  return d.toLocaleDateString("pt-BR");
}

/* ---------- Saudação automática ---------- */

function getSaudacao() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Bom dia!";
  if (h >= 12 && h < 18) return "Boa tarde!";
  return "Boa noite!";
}

/* ---------- Aviso configurável ---------- */

function getDiasAviso() {
  const v = parseInt(localStorage.getItem("dias_aviso") || "", 10);
  return isNaN(v) || v < 0 ? DIAS_ANTES_AVISO_DEFAULT : v;
}

function setDiasAviso(v) {
  const n = parseInt(v, 10);
  if (isNaN(n) || n < 0) return;
  localStorage.setItem("dias_aviso", String(n));
  updateAlerts();
}

/* ---------- Feedback de salvamento ---------- */

function markSaved() {
  const el = document.getElementById("saveStatus");
  el.textContent = "💾 Salvando...";
  el.style.color = "#e67e22";
  clearTimeout(window._saveTimer);
  window._saveTimer = setTimeout(() => {
    el.textContent = "✔ Salvo";
    el.style.color = "#27ae60";
  }, 400);
}

/* ---------- Número do WhatsApp ---------- */

function normalizarNumeroZap(raw) {
  let num = String(raw || "").replace(/\D/g, "");
  if (!num) return "";
  if (!num.startsWith("55") && (num.length === 10 || num.length === 11)) {
    num = "55" + num;
  }
  return num;
}

function salvarNumero() {
  const raw = document.getElementById("numeroZap").value;
  const num = normalizarNumeroZap(raw);
  localStorage.setItem("zap_ptp", num);
  document.getElementById("numeroZap").value = num;
}

/* ---------- Linhas da tabela ---------- */

function addRow(data = {}, skipSave = false) {
  const tr = document.createElement("tr");
  const id = data.id || uid();
  tr.dataset.id = id;

  tr.innerHTML = `
    <td><input type="text" list="lista-empresas" class="f-emp" value="${escapeHtml(data.empresa)}" onchange="onChangeField()" placeholder="..."></td>
    <td><input type="text" list="lista-atividades" class="f-atv" value="${escapeHtml(data.atividade)}" onchange="onChangeField()" placeholder="..."></td>
    <td><input type="date" class="f-ini" value="${escapeHtml(data.inicio)}" onchange="onChangeDataInicio(this)"></td>
    <td><input type="date" class="f-fim" value="${escapeHtml(data.fim)}" onchange="onChangeField()"></td>
    <td><input type="text" class="f-num" placeholder="Ex.: PTP 19" value="${escapeHtml(data.nump)}" onchange="onChangeField()"></td>
    <td><input type="text" class="f-fa" placeholder="Ex: 1968" value="${escapeHtml(data.fa)}" onchange="onChangeField()"></td>
    <td><input type="text" class="f-turno" placeholder="Ex: 1º Turno" value="${escapeHtml(data.turno)}" onchange="onChangeField()"></td>
    <td><input type="text" class="f-local" placeholder="Ex: Família 1" value="${escapeHtml(data.local)}" onchange="onChangeField()"></td>
    <td><input type="text" class="f-supervisor" placeholder="Ex: Kleber" value="${escapeHtml(data.supervisor)}" onchange="onChangeField()"></td>
    <td class="col-status"><span class="status-txt">—</span></td>
    <td><button class="del" onclick="confirmarExclusao(this)">X</button></td>

    <input type="hidden" class="f-flag-solic" value="${escapeHtml(data.flagSolic)}">
    <input type="hidden" class="f-flag-reserva" value="${escapeHtml(data.flagReserva)}">
    <input type="hidden" class="f-data-entrega" value="${escapeHtml(data.dataEntrega)}">
    <input type="hidden" class="f-ini-anterior" value="${escapeHtml(data.inicio)}">
  `;
  document.getElementById("body").appendChild(tr);
  if (!skipSave) onChangeField(false);
}

/* ---------- Renovação via troca de data ---------- */

function onChangeDataInicio(input) {
  const tr = input.closest("tr");
  const anterior = tr.querySelector(".f-ini-anterior").value;
  const novo = input.value;

  // Linha nova: só preenche o fim automaticamente
  if (!anterior) {
    tr.querySelector(".f-ini-anterior").value = novo;
    if (novo) {
      const dIni = toDate(novo);
      tr.querySelector(".f-fim").value = toInputDate(addDays(dIni, DIAS_DURACAO_PTP));
    }
    onChangeField();
    return;
  }

  if (novo !== anterior) {
    const dIni = toDate(novo);
    if (!dIni) {
      onChangeField();
      return;
    }

    const dFim = addDays(dIni, DIAS_DURACAO_PTP);
    const msg = `Confirmar renovação da PTP?\n\n` +
                `Data anterior: ${fmtDate(toDate(anterior))}\n` +
                `Nova PTP: ${fmtDate(dIni)} → ${fmtDate(dFim)}\n\n` +
                `(Nº PTP e demais dados serão mantidos)`;

    if (confirm(msg)) {
      try {
        localStorage.setItem(
          STORAGE_KEY + "_backup_" + tr.dataset.id + "_" + Date.now(),
          JSON.stringify({
            inicio: anterior,
            fim: tr.querySelector(".f-fim").value,
            nump: tr.querySelector(".f-num").value
          })
        );
      } catch (e) { console.warn("backup falhou:", e); }

      tr.querySelector(".f-ini-anterior").value = novo;
      tr.querySelector(".f-fim").value = toInputDate(dFim);
      tr.querySelector(".f-flag-solic").value = "";
      tr.querySelector(".f-flag-reserva").value = "";
      tr.querySelector(".f-data-entrega").value = "";

      onChangeField();
    } else {
      input.value = anterior;
    }
  }
}

/* ---------- Ações por ID ---------- */

function getRowById(id) {
  return document.querySelector(`#body tr[data-id="${id}"]`);
}

function acaoSolicitado(id) {
  const tr = getRowById(id);
  if (tr) {
    tr.querySelector(".f-flag-solic").value = "SIM";
    updateAlerts();
    saveNow();
  }
}

function acaoEntregue(id) {
  const tr = getRowById(id);
  if (tr) {
    tr.querySelector(".f-flag-reserva").value = "SIM";
    tr.querySelector(".f-data-entrega").value = new Date().toISOString();
    updateAlerts();
    saveNow();
  }
}

/* ---------- WhatsApp ---------- */

function montarTextoItem(tr) {
  const emp        = tr.querySelector(".f-emp").value;
  const atv        = tr.querySelector(".f-atv").value;
  const nump       = tr.querySelector(".f-num").value;
  const fa         = tr.querySelector(".f-fa").value;
  const turno      = tr.querySelector(".f-turno").value;
  const local      = tr.querySelector(".f-local").value;
  const supervisor = tr.querySelector(".f-supervisor").value;
  const dFim       = toDate(tr.querySelector(".f-fim").value);

  const v = (x) => encodeURIComponent((x && String(x).trim()) ? x : "—");

  return (
    `1 - *Atividade:* ${v(atv)}%0A%0A` +
    `2 - *N° da PTP:* ${v(nump)}%0A%0A` +
    `3 - *N° da FA:* ${v(fa)}%0A%0A` +
    `4 - *Supervisor Responsável:* ${v(supervisor)}%0A%0A` +
    `5 - *Empresa:* ${v(emp)}%0A%0A` +
    `6 - *Data de Vencimento:* ${v(fmtDate(dFim))}%0A%0A` +
    `7 - *Turno/Horário:* ${v(turno)}%0A%0A` +
    `8 - *Local da atividade:* ${v(local)}`
  );
}

function enviarZapItem(id) {
  const tr = getRowById(id);
  if (!tr) return;

  const num = localStorage.getItem("zap_ptp") || "";
  if (!num) {
    alert("Por favor, preencha o número do Zap no topo da tela primeiro!");
    return;
  }

  const texto =
    `${encodeURIComponent(getSaudacao())}%0A%0A` +
    `*FORMULÁRIO PARA SOLICITAÇÃO DE PTP (RENOVAÇÃO)*%0A%0A` +
    montarTextoItem(tr);

  const url = `https://wa.me/${num}?text=${texto}`;
  window.open(url, "_blank");

  acaoSolicitado(id);
}

let itensParaZap = [];

function enviarWhatsAppDoModal() {
  if (itensParaZap.length === 0) return;

  const num = localStorage.getItem("zap_ptp") || "";
  if (!num) {
    alert("Por favor, preencha o número do Zap no topo da tela primeiro!");
    fecharModal();
    return;
  }

  let texto =
    `${encodeURIComponent(getSaudacao())}%0A%0A` +
    `*FORMULÁRIO PARA SOLICITAÇÃO DE PTP (RENOVAÇÃO)*%0A%0A`;

  let enviados = 0;

  itensParaZap.forEach((item, i) => {
    const tr = getRowById(item.id);
    if (!tr) return;

    texto += montarTextoItem(tr);
    if (i < itensParaZap.length - 1) {
      texto += `%0A%0A--------------------%0A%0A`;
    }
    tr.querySelector(".f-flag-solic").value = "SIM";
    enviados++;
  });

  if (enviados === 0) {
    alert("Nenhuma PTP pendente encontrada (a tabela pode ter sido alterada).");
    fecharModal();
    return;
  }

  const url = `https://wa.me/${num}?text=${texto}`;
  window.open(url, "_blank");

  fecharModal();
  updateAlerts();
  saveNow();
}

function fecharModal() {
  document.getElementById("modalAlerta").style.display = "none";
}

function checarPopUpInicial(pendentes) {
  const ultimoAviso = localStorage.getItem("ultimo_aviso_zap");
  const agora = new Date().getTime();
  const dezMinutos = 10 * 60 * 1000;

  if (ultimoAviso && agora - parseInt(ultimoAviso) < dezMinutos) return;

  if (pendentes.length > 0) {
    document.getElementById("modalTexto").innerHTML =
      `Existem <b>${pendentes.length} PTP(s)</b> que precisam de ação.<br><br>Deseja enviar a solicitação agora pelo WhatsApp?`;
    document.getElementById("modalAlerta").style.display = "flex";
    localStorage.setItem("ultimo_aviso_zap", agora);
  }
}

/* ---------- Atualização de status ---------- */

function updateAlerts(checarPopUp = false) {
  const rows = document.querySelectorAll("#body tr");
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const diasAviso = getDiasAviso();

  let total = rows.length;
  let aguardandoCount = 0;
  let pendenteCount = 0;
  let reservadoCount = 0;
  let vencidaCount = 0;

  itensParaZap = [];

  const cardsVencidas = [];
  const cardsAguardando = [];
  const cardsPendentes = [];

  rows.forEach(tr => {
    const id = tr.dataset.id;
    const emp = tr.querySelector(".f-emp").value;
    const atv = tr.querySelector(".f-atv").value;
    const inicio = tr.querySelector(".f-ini").value;
    const fim = tr.querySelector(".f-fim").value;
    const nump = tr.querySelector(".f-num").value;

    const flagSolic = tr.querySelector(".f-flag-solic").value;
    const flagReserva = tr.querySelector(".f-flag-reserva").value;

    const tdStatus = tr.querySelector(".col-status");
    const statusTxt = tr.querySelector(".status-txt");

    const dIni = toDate(inicio);
    const dFim = toDate(fim);

    tdStatus.className = "col-status";
    statusTxt.textContent = "—";

    if (dIni && dFim && dFim < dIni) {
      tdStatus.classList.add("status-vencida");
      statusTxt.textContent = "⚠ DATAS INVÁLIDAS";
      return;
    }

    if (!dIni || !dFim) return;

    const diasParaVencer = daysBetween(hoje, dFim);
    const estaVencida = hoje > dFim;
    const dentroDoAviso = diasParaVencer <= diasAviso && diasParaVencer >= 0;

    if (flagReserva === "SIM") {
      tdStatus.classList.add("status-reservado");
      statusTxt.textContent = "ENTREGUE ✔";
      reservadoCount++;
      return;
    }

    if (flagSolic === "SIM") {
      if (estaVencida) {
        tdStatus.classList.add("status-pendente");
        statusTxt.textContent = "VENCIDA (SOLICITADA)";
        vencidaCount++;
        pendenteCount++;

        cardsPendentes.push(`
          <div class="card-pendencia" style="border-color:#e74c3c; background:#fdecea;">
            <div>
              <strong>${escapeHtml(emp || "Empresa")}</strong> ${nump ? "(Nº " + escapeHtml(nump) + ")" : ""}<br>
              ${escapeHtml(atv || "Atividade")} • <span style="color:#a00; font-weight:bold;">🔴 Vencida • Aguardando entrega</span>
            </div>
            <div>
              <button class="btn-ok" onclick="acaoEntregue('${id}')">PTP Entregue</button>
            </div>
          </div>
        `);
      } else {
        tdStatus.classList.add("status-pendente");
        statusTxt.textContent = "PENDENTE (AGUARDANDO)";
        pendenteCount++;

        cardsPendentes.push(`
          <div class="card-pendencia">
            <div>
              <strong>${escapeHtml(emp || "Empresa")}</strong> ${nump ? "(Nº " + escapeHtml(nump) + ")" : ""}<br>
              ${escapeHtml(atv || "Atividade")} • <span style="color:#b9770e; font-weight:bold;">Aguardando entrega</span>
            </div>
            <div>
              <button class="btn-ok" onclick="acaoEntregue('${id}')">PTP Entregue</button>
            </div>
          </div>
        `);
      }
      return;
    }

    if (estaVencida) {
      tdStatus.classList.add("status-vencida");
      statusTxt.textContent = "VENCIDA";
      vencidaCount++;
      aguardandoCount++;

      itensParaZap.push({ id, emp, atv, nump, fim });

      cardsVencidas.push(`
        <div class="card-pendencia" style="border-color:#e74c3c; background:#fdecea;">
          <div>
            <strong>${escapeHtml(emp || "Empresa")}</strong> ${nump ? "(Nº " + escapeHtml(nump) + ")" : ""}<br>
            ${escapeHtml(atv || "Atividade")} • <span style="color:#a00; font-weight:bold;">🔴 Vencida • Solicitar renovação</span>
          </div>
          <div>
            <button class="btn-zap" onclick="enviarZapItem('${id}')">Zap</button>
            <button class="btn-ok" onclick="acaoSolicitado('${id}')">Solicitado</button>
          </div>
        </div>
      `);
      return;
    }

    if (dentroDoAviso) {
      tdStatus.classList.add("status-aguardando");
      statusTxt.textContent = `RENOVAR (${diasParaVencer}d)`;
      aguardandoCount++;

      itensParaZap.push({ id, emp, atv, nump, fim });

      cardsAguardando.push(`
        <div class="card-pendencia">
          <div>
            <strong>${escapeHtml(emp || "Empresa")}</strong> ${nump ? "(Nº " + escapeHtml(nump) + ")" : ""}<br>
            ${escapeHtml(atv || "Atividade")} • <span style="color:#d35400; font-weight:bold;">Renovar (${diasParaVencer} dia${diasParaVencer === 1 ? "" : "s"} restante${diasParaVencer === 1 ? "" : "s"})</span>
          </div>
          <div>
            <button class="btn-zap" onclick="enviarZapItem('${id}')">Zap</button>
            <button class="btn-ok" onclick="acaoSolicitado('${id}')">Solicitado</button>
          </div>
        </div>
      `);
      return;
    }

    tdStatus.classList.add("status-ativa");
    statusTxt.textContent = "ATIVA";
  });

  document.getElementById("counter").textContent =
    `Total: ${total} | Entregues: ${reservadoCount} | Pendentes: ${pendenteCount} | Aguardando Renovação: ${aguardandoCount} | Vencidas: ${vencidaCount}`;

  const painel = document.getElementById("painelPendencias");
  const lista = document.getElementById("listaPendencias");

  const todasAsCards = cardsVencidas.concat(cardsAguardando).concat(cardsPendentes);

  if (todasAsCards.length === 0) {
    painel.style.display = "none";
  } else {
    painel.style.display = "block";
    lista.innerHTML = todasAsCards.join("");
  }

  if (checarPopUp) {
    checarPopUpInicial(itensParaZap);
  }
}

/* ---------- Persistência ---------- */

window._saveDebounce = null;

function save() {
  clearTimeout(window._saveDebounce);
  window._saveDebounce = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
      markSaved();
    } catch (e) {
      console.warn("Erro ao salvar:", e);
    }
  }, 250);
}

function saveNow() {
  clearTimeout(window._saveDebounce);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(collectData()));
    markSaved();
  } catch (e) {
    console.warn("Erro ao salvar:", e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Erro ao carregar:", e);
  }
  return null;
}

function collectData() {
  const rows = [];
  document.querySelectorAll("#body tr").forEach(tr => {
    rows.push({
      id: tr.dataset.id,
      empresa: tr.querySelector(".f-emp").value,
      atividade: tr.querySelector(".f-atv").value,
      inicio: tr.querySelector(".f-ini").value,
      fim: tr.querySelector(".f-fim").value,
      nump: tr.querySelector(".f-num").value,
      fa: tr.querySelector(".f-fa").value,
      turno: tr.querySelector(".f-turno").value,
      local: tr.querySelector(".f-local").value,
      supervisor: tr.querySelector(".f-supervisor").value,
      flagSolic: tr.querySelector(".f-flag-solic").value,
      flagReserva: tr.querySelector(".f-flag-reserva").value,
      dataEntrega: tr.querySelector(".f-data-entrega").value,
      iniAnterior: tr.querySelector(".f-ini-anterior").value
    });
  });
  return rows;
}

function renderAll(data) {
  document.getElementById("body").innerHTML = "";
  data.forEach(d => addRow(d, true));
  updateAlerts(true);
}

/* ---------- Ordenação ---------- */

function sortTable(skipSave = false) {
  const data = collectData();
  data.sort((a, b) => {
    const e = (a.empresa || "").localeCompare(b.empresa || "", "pt-BR");
    if (e !== 0) return e;
    return (a.inicio || "").localeCompare(b.inicio || "");
  });
  renderAll(data);
  if (!skipSave) saveNow();
}

function onChangeField(doSort = false) {
  if (doSort) sortTable(true);
  updateAlerts();
  save();
}

/* ---------- Exclusão ---------- */

function confirmarExclusao(btn) {
  if (confirm("⚠️ ATENÇÃO: Você está prestes a APAGAR esta linha.\nDeseja continuar?")) {
    btn.closest("tr").remove();
    onChangeField();
  }
}

/* ---------- Exportação CSV ---------- */

function exportCSV() {
  const rows = [["Empresa", "Atividade", "Início", "Fim", "Nº PTP", "Nº FA", "Turno", "Local", "Supervisor", "Status", "Data Entrega"]];
  collectData().forEach(d => {
    let status = "ATIVA";
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    const dIni = toDate(d.inicio), dFim = toDate(d.fim);
    const diasAviso = getDiasAviso();

    if (dIni && dFim) {
      if (dFim < dIni) {
        status = "DATAS INVÁLIDAS";
      } else if (d.flagReserva === "SIM") {
        status = "ENTREGUE";
      } else if (hoje > dFim) {
        status = d.flagSolic === "SIM" ? "VENCIDA SOLICITADA" : "VENCIDA";
      } else if (daysBetween(hoje, dFim) <= diasAviso) {
        status = d.flagSolic === "SIM" ? "PENDENTE" : "AGUARDANDO RENOVAÇÃO";
      }
    }
    const dataEntrega = d.dataEntrega ? new Date(d.dataEntrega).toLocaleString("pt-BR") : "";
    rows.push([d.empresa, d.atividade, d.inicio, d.fim, d.nump, d.fa, d.turno, d.local, d.supervisor, status, dataEntrega]);
  });

  const csv = rows.map(r => r.map(c => `"${(c || "").toString().replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `controle_ptp_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/* ---------- Limpar tudo ---------- */

function clearAll() {
  if (!confirm("Apagar TODAS as linhas? Esta ação não pode ser desfeita.\n\n(Uma cópia de segurança será guardada automaticamente.)")) return;

  try {
    localStorage.setItem(STORAGE_KEY + "_backup", JSON.stringify(collectData()));
    localStorage.setItem(STORAGE_KEY + "_backup_data", new Date().toISOString());
  } catch (e) {
    console.warn("Não foi possível gerar backup:", e);
  }

  document.getElementById("body").innerHTML = "";
  updateAlerts();
  saveNow();
}

/* ---------- Inicialização ---------- */

(function init() {
  const numSalvo = localStorage.getItem("zap_ptp");
  if (numSalvo) document.getElementById("numeroZap").value = numSalvo;

  const diasAvisoSalvo = localStorage.getItem("dias_aviso");
  const elDias = document.getElementById("diasAviso");
  if (elDias) elDias.value = diasAvisoSalvo !== null ? diasAvisoSalvo : DIAS_ANTES_AVISO_DEFAULT;

  const saved = load();
  if (saved && saved.length) {
    renderAll(saved);
  } else {
    addRow({
      empresa: "Evastec",
      atividade: "Montagem de Infra Elétrica",
      inicio: "2026-10-31",
      fim: "2026-11-06",
      nump: "PTP 19",
      fa: "1968",
      turno: "1º Turno (07:00h às 18:00h)",
      local: "Família 1 / COL: A8 a A15",
      supervisor: "Kleber Calixto"
    }, true);
    updateAlerts(true);
    saveNow();
  }

  setInterval(() => {
    updateAlerts(true);
  }, 60000);
})();