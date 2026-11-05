/*
 * Senac Connect: painel institucional.
 * Indicadores, histórico, solicitações de saída e ocorrências.
 */
(function () {
  "use strict";

  const { auth, data, catalog, domain, time, ui, MOVEMENT_STATUS, REQUEST_STATUS } = window.SC;
  if (!auth.requireRole("institucional")) return;

  const OVERVIEW_LIST_LIMIT = 6;
  const MIN_REFUSAL_LENGTH = 5;

  const $ = (id) => document.getElementById(id);
  const els = {
    overviewDate: $("overviewDate"),
    overviewSubtitle: $("overviewSubtitle"),
    kpis: $("kpis"),
    pendingList: $("pendingList"),
    alertList: $("alertList"),
    arrivalsList: $("arrivalsList"),
    exitsList: $("exitsList"),
    globalAlert: $("globalAlert"),
    navPending: $("navPending"),
    navAlerts: $("navAlerts"),
    historyFilters: $("historyFilters"),
    filterAluno: $("filterAluno"),
    filterTurma: $("filterTurma"),
    filterData: $("filterData"),
    filterSituacao: $("filterSituacao"),
    requestFilters: $("requestFilters"),
    requestStatus: $("requestStatus"),
    requestTurma: $("requestTurma"),
    requestData: $("requestData"),
    detailsDialog: $("detailsDialog"),
    detailsBody: $("detailsBody"),
    detailsActions: $("detailsActions"),
    refuseDialog: $("refuseDialog"),
    refuseForm: $("refuseForm"),
    refuseSummary: $("refuseSummary"),
    refuseReason: $("refuseReason"),
    refuseReasonError: $("refuseReasonError"),
  };

  let refusingId = null;
  let knownMovements = new Set();
  let knownRequests = new Set();

  /* ---------- Helpers de apresentação ---------- */

  const alunoOf = (item) => catalog.getAluno(item.alunoId);
  const escape = ui.escapeHtml;

  function studentCell(item, withTurma = false) {
    const aluno = alunoOf(item);
    const detail = withTurma ? catalog.turmaLabel(aluno.turmaId) : `Matrícula ${aluno.matricula}`;
    return `<strong>${escape(aluno.nome)}</strong><small class="cell-sub">${escape(detail)}</small>`;
  }

  function requestWhen(solicitacao) {
    return `${time.formatDay(solicitacao.data)} às ${solicitacao.horario}`;
  }

  function actionButton(action, id, iconName, label, tone) {
    return `<button class="action-button action-button--${tone}" type="button" data-action="${action}" data-id="${id}" aria-label="${escape(label)}" title="${escape(label)}">${ui.icon(iconName)}</button>`;
  }

  function requestActions(solicitacao) {
    const buttons = [actionButton("details", solicitacao.id, "search", "Ver detalhes", "neutral")];
    if (solicitacao.status === "pendente") {
      buttons.push(actionButton("approve", solicitacao.id, "thumbsUp", "Aprovar solicitação", "success"));
      buttons.push(actionButton("refuse", solicitacao.id, "thumbsDown", "Recusar solicitação", "danger"));
    }
    return `<div class="action-group">${buttons.join("")}</div>`;
  }

  function fillSelect(select, firstLabel, options) {
    select.innerHTML =
      `<option value="">${escape(firstLabel)}</option>` +
      options.map(({ value, label }) => `<option value="${value}">${escape(label)}</option>`).join("");
  }

  /* ---------- Tabelas ---------- */

  const historyTable = ui.createDataTable($("historyTable"), {
    exportName: "movimentacoes",
    defaultSort: { key: "quando", dir: "desc" },
    emptyTitle: "Nenhuma movimentação para os filtros escolhidos",
    emptyText: "Altere os filtros ou clique em “Limpar filtros”.",
    rowClass: (movimento) => (movimento.situacao === "sem_liberacao" ? "row--danger" : ""),
    searchText: (movimento) => {
      const aluno = alunoOf(movimento);
      return `${aluno.nome} ${aluno.matricula} ${catalog.turmaLabel(aluno.turmaId)} ${MOVEMENT_STATUS[movimento.situacao].label}`;
    },
    columns: [
      {
        key: "quando",
        label: "Data e horário",
        render: (m) => `${escape(time.formatDate(time.dateKeyOf(m.timestamp)))}<small class="cell-sub">${time.timeOf(m.timestamp)}</small>`,
        sortValue: (m) => m.timestamp,
        csv: (m) => `${time.formatDate(time.dateKeyOf(m.timestamp))} ${time.timeOf(m.timestamp)}`,
      },
      {
        key: "aluno",
        label: "Aluno",
        render: studentCell,
        sortValue: (m) => alunoOf(m).nome,
        csv: (m) => alunoOf(m).nome,
      },
      {
        key: "turma",
        label: "Turma",
        render: (m) => escape(catalog.turmaLabel(alunoOf(m).turmaId)),
        sortValue: (m) => catalog.turmaLabel(alunoOf(m).turmaId),
        csv: (m) => catalog.turmaLabel(alunoOf(m).turmaId),
      },
      {
        key: "evento",
        label: "Evento",
        render: (m) => (m.tipo === "entrada" ? "Entrada" : "Saída"),
        sortValue: (m) => m.tipo,
        csv: (m) => (m.tipo === "entrada" ? "Entrada" : "Saída"),
      },
      {
        key: "situacao",
        label: "Situação",
        render: (m) => {
          let extra = "";
          if (m.situacao === "sem_liberacao") extra = m.alertaResolvido ? "Verificada pela escola" : "Aguardando verificação";
          if (m.situacao === "autorizada") {
            const solicitacao = data.getState().solicitacoes.find((s) => s.id === m.solicitacaoId);
            if (solicitacao) extra = `Liberada para ${solicitacao.horario}`;
          }
          return `${ui.badge(MOVEMENT_STATUS[m.situacao])}${extra ? `<small class="cell-sub">${escape(extra)}</small>` : ""}`;
        },
        sortValue: (m) => MOVEMENT_STATUS[m.situacao].label,
        csv: (m) => MOVEMENT_STATUS[m.situacao].label,
      },
    ],
  });

  const requestsTable = ui.createDataTable($("requestsTable"), {
    exportName: "solicitacoes-saida",
    defaultSort: { key: "enviada", dir: "desc" },
    emptyTitle: "Nenhuma solicitação para os filtros escolhidos",
    emptyText: "Quando um responsável enviar um pedido, ele aparecerá aqui.",
    rowClass: (s) => (s.status === "pendente" ? "row--warning" : ""),
    searchText: (s) => `${alunoOf(s).nome} ${catalog.getResponsavel(s.responsavelId).nome} ${s.motivo}`,
    columns: [
      {
        key: "aluno",
        label: "Aluno",
        render: (s) => studentCell(s, true),
        sortValue: (s) => alunoOf(s).nome,
        csv: (s) => `${alunoOf(s).nome} (${catalog.turmaLabel(alunoOf(s).turmaId)})`,
      },
      {
        key: "responsavel",
        label: "Responsável",
        render: (s) => escape(catalog.getResponsavel(s.responsavelId).nome),
        sortValue: (s) => catalog.getResponsavel(s.responsavelId).nome,
        csv: (s) => catalog.getResponsavel(s.responsavelId).nome,
      },
      {
        key: "prevista",
        label: "Saída prevista",
        render: (s) => `${escape(time.formatDate(s.data))}<small class="cell-sub">${s.horario}</small>`,
        sortValue: (s) => `${s.data} ${s.horario}`,
        csv: (s) => `${time.formatDate(s.data)} ${s.horario}`,
      },
      {
        key: "motivo",
        label: "Motivo",
        render: (s) => `<span class="cell-clamp">${escape(s.motivo)}</span>`,
        sortable: false,
        csv: (s) => s.motivo,
      },
      {
        key: "enviada",
        label: "Solicitação",
        render: (s) => escape(time.formatTimestamp(s.criadaEm)),
        sortValue: (s) => s.criadaEm,
        csv: (s) => time.formatTimestamp(s.criadaEm),
      },
      {
        key: "status",
        label: "Situação",
        render: (s) => ui.requestBadge(s),
        sortValue: (s) => REQUEST_STATUS[s.status].label,
        csv: (s) => REQUEST_STATUS[s.status].label,
      },
      { key: "acoes", label: "Ações", render: requestActions, sortable: false, className: "cell-actions" },
    ],
  });

  const alertsTable = ui.createDataTable($("alertsTable"), {
    exportName: "ocorrencias",
    defaultSort: { key: "quando", dir: "desc" },
    emptyTitle: "Nenhuma saída sem liberação registrada",
    emptyText: "As ocorrências aparecem aqui assim que a catraca registra uma saída sem autorização.",
    rowClass: (m) => (m.alertaResolvido ? "" : "row--danger"),
    searchText: (m) => `${alunoOf(m).nome} ${catalog.turmaLabel(alunoOf(m).turmaId)}`,
    columns: [
      {
        key: "quando",
        label: "Data e horário",
        render: (m) => `${escape(time.formatDate(time.dateKeyOf(m.timestamp)))}<small class="cell-sub">${time.timeOf(m.timestamp)}</small>`,
        sortValue: (m) => m.timestamp,
        csv: (m) => `${time.formatDate(time.dateKeyOf(m.timestamp))} ${time.timeOf(m.timestamp)}`,
      },
      { key: "aluno", label: "Aluno", render: studentCell, sortValue: (m) => alunoOf(m).nome, csv: (m) => alunoOf(m).nome },
      {
        key: "turma",
        label: "Turma",
        render: (m) => escape(catalog.turmaLabel(alunoOf(m).turmaId)),
        sortValue: (m) => catalog.turmaLabel(alunoOf(m).turmaId),
        csv: (m) => catalog.turmaLabel(alunoOf(m).turmaId),
      },
      {
        key: "turno",
        label: "Fim do turno",
        render: (m) => catalog.getTurma(alunoOf(m).turmaId).fim,
        sortable: false,
        csv: (m) => catalog.getTurma(alunoOf(m).turmaId).fim,
      },
      {
        key: "status",
        label: "Situação",
        render: (m) =>
          m.alertaResolvido
            ? ui.badge({ label: "Verificada", tone: "neutral", icon: "check" })
            : ui.badge({ label: "Aguardando verificação", tone: "danger", icon: "alert" }),
        sortValue: (m) => (m.alertaResolvido ? 1 : 0),
        csv: (m) => (m.alertaResolvido ? "Verificada" : "Aguardando verificação"),
      },
      {
        key: "acoes",
        label: "Ações",
        sortable: false,
        className: "cell-actions",
        render: (m) =>
          m.alertaResolvido
            ? '<span class="cell-sub">Sem ações</span>'
            : `<button class="ghost-button ghost-button--small" type="button" data-action="resolve" data-id="${m.id}">Marcar como verificada</button>`,
      },
    ],
  });

  /* ---------- Visão geral ---------- */

  function studentsInside(state, dateKey) {
    const lastByStudent = new Map();
    state.movimentos
      .filter((m) => time.dateKeyOf(m.timestamp) === dateKey)
      .sort((a, b) => a.timestamp - b.timestamp)
      .forEach((m) => lastByStudent.set(m.alunoId, m));
    return [...lastByStudent.values()].filter((m) => m.tipo === "entrada").length;
  }

  function renderKpis(state, dateKey, movimentos) {
    const saidas = movimentos.filter((m) => m.tipo === "saida");
    const pendentes = state.solicitacoes.filter((s) => s.status === "pendente").length;
    const cards = [
      { label: "Chegadas", value: movimentos.filter((m) => m.tipo === "entrada").length, tone: "info", icon: "entrada", situacao: "entrada" },
      { label: "Saídas", value: saidas.length, tone: "neutral", icon: "saida", situacao: "saida" },
      { label: "Saídas autorizadas", value: saidas.filter((m) => m.situacao === "autorizada").length, tone: "success", icon: "check", situacao: "autorizada" },
      { label: "Saídas sem liberação", value: saidas.filter((m) => m.situacao === "sem_liberacao").length, tone: "danger", icon: "alert", situacao: "sem_liberacao" },
      { label: "Solicitações pendentes", value: pendentes, tone: "warning", icon: "clock", goto: "solicitacoes" },
    ];
    if (dateKey === time.todayKey()) {
      cards.push({ label: "Na escola agora", value: studentsInside(state, dateKey), tone: "brand", icon: "users", hint: `de ${catalog.alunos.length} alunos` });
    }

    els.kpis.innerHTML = cards
      .map((card) => {
        const attrs = card.goto
          ? `data-goto="${card.goto}"`
          : card.situacao
            ? `data-goto-history="${card.situacao}"`
            : "";
        const tag = attrs ? "button" : "div";
        return `
          <${tag} class="kpi kpi--${card.tone}" ${tag === "button" ? 'type="button"' : ""} ${attrs}>
            <span class="kpi__icon">${ui.icon(card.icon)}</span>
            <span class="kpi__value">${card.value}</span>
            <span class="kpi__label">${escape(card.label)}</span>
            ${card.hint ? `<span class="kpi__hint">${escape(card.hint)}</span>` : ""}
          </${tag}>`;
      })
      .join("");
  }

  function eventList(movimentos, emptyTitle) {
    if (!movimentos.length) return ui.emptyState(emptyTitle);
    const items = movimentos.slice(0, OVERVIEW_LIST_LIMIT).map((m) => {
      const aluno = alunoOf(m);
      return `
        <li class="event-row">
          <time>${time.timeOf(m.timestamp)}</time>
          <span class="event-row__main"><strong>${escape(aluno.nome)}</strong><small>${escape(catalog.turmaLabel(aluno.turmaId))}</small></span>
          ${ui.badge(MOVEMENT_STATUS[m.situacao])}
        </li>`;
    });
    const more = movimentos.length - OVERVIEW_LIST_LIMIT;
    return `<ul class="event-list">${items.join("")}</ul>${more > 0 ? `<p class="list-more">+ ${more} registro(s) no histórico</p>` : ""}`;
  }

  function renderPendingList(state) {
    const pending = state.solicitacoes
      .filter((s) => s.status === "pendente")
      .sort((a, b) => `${a.data}${a.horario}`.localeCompare(`${b.data}${b.horario}`));
    if (!pending.length) {
      els.pendingList.innerHTML = ui.emptyState("Nenhuma solicitação pendente", "Novos pedidos dos responsáveis aparecem aqui automaticamente.");
      return;
    }
    els.pendingList.innerHTML = `<ul class="request-list">${pending
      .slice(0, 4)
      .map((s) => {
        const aluno = alunoOf(s);
        return `
          <li class="request-item">
            <div class="request-item__main">
              <strong>${escape(aluno.nome)}</strong>
              <small>${escape(catalog.turmaLabel(aluno.turmaId))} · por ${escape(catalog.getResponsavel(s.responsavelId).nome)}</small>
              <span class="request-item__when">${ui.icon("clock")}${escape(requestWhen(s))}</span>
              <p>${escape(s.motivo)}</p>
            </div>
            ${requestActions(s)}
          </li>`;
      })
      .join("")}</ul>`;
  }

  function renderAlertList(state) {
    const open = state.movimentos
      .filter((m) => m.situacao === "sem_liberacao" && !m.alertaResolvido)
      .sort((a, b) => b.timestamp - a.timestamp);
    els.alertList.innerHTML = open.length
      ? `<ul class="event-list">${open
          .map((m) => {
            const aluno = alunoOf(m);
            return `
              <li class="event-row event-row--danger">
                <time>${escape(time.formatTimestamp(m.timestamp))}</time>
                <span class="event-row__main"><strong>${escape(aluno.nome)}</strong><small>${escape(catalog.turmaLabel(aluno.turmaId))} · responsável notificado</small></span>
                <button class="ghost-button ghost-button--small" type="button" data-action="resolve" data-id="${m.id}">Marcar como verificada</button>
              </li>`;
          })
          .join("")}</ul>`
      : ui.emptyState("Nenhuma ocorrência aguardando verificação");
  }

  function renderOverview(state) {
    const dateKey = els.overviewDate.value || time.todayKey();
    const movimentos = state.movimentos
      .filter((m) => time.dateKeyOf(m.timestamp) === dateKey)
      .sort((a, b) => b.timestamp - a.timestamp);

    els.overviewSubtitle.textContent = `Movimentações de ${time.formatDay(dateKey).toLowerCase() === "hoje" ? "hoje" : time.formatDate(dateKey)}, registradas pela catraca simulada.`;
    renderKpis(state, dateKey, movimentos);
    renderPendingList(state);
    renderAlertList(state);
    els.arrivalsList.innerHTML = eventList(movimentos.filter((m) => m.tipo === "entrada"), "Nenhuma chegada registrada nesta data");
    els.exitsList.innerHTML = eventList(movimentos.filter((m) => m.tipo === "saida"), "Nenhuma saída registrada nesta data");
  }

  function renderCounters(state) {
    const pending = state.solicitacoes.filter((s) => s.status === "pendente").length;
    const open = state.movimentos.filter((m) => m.situacao === "sem_liberacao" && !m.alertaResolvido);

    els.navPending.hidden = pending === 0;
    els.navPending.textContent = pending;
    els.navPending.setAttribute("aria-label", `${pending} pendentes`);
    els.navAlerts.hidden = open.length === 0;
    els.navAlerts.textContent = open.length;
    els.navAlerts.setAttribute("aria-label", `${open.length} a verificar`);

    if (!open.length) {
      els.globalAlert.innerHTML = "";
      return;
    }
    const latest = open.sort((a, b) => b.timestamp - a.timestamp)[0];
    els.globalAlert.innerHTML = `
      <div class="alert-banner">
        ${ui.icon("alert")}
        <p><strong>${open.length} saída(s) sem liberação aguardando verificação.</strong>
        Última: ${escape(alunoOf(latest).nome)}, ${escape(time.formatTimestamp(latest.timestamp).toLowerCase())}.</p>
        <a class="alert-banner__action" href="#ocorrencias">Ver ocorrências</a>
      </div>`;
  }

  /* ---------- Filtros ---------- */

  function filteredMovements(state) {
    const { value: alunoId } = els.filterAluno;
    const { value: turmaId } = els.filterTurma;
    const { value: dateKey } = els.filterData;
    const { value: situacao } = els.filterSituacao;
    return state.movimentos.filter((m) => {
      const aluno = alunoOf(m);
      if (alunoId && m.alunoId !== alunoId) return false;
      if (turmaId && aluno.turmaId !== turmaId) return false;
      if (dateKey && time.dateKeyOf(m.timestamp) !== dateKey) return false;
      if (situacao === "saida") return m.tipo === "saida";
      if (situacao && m.situacao !== situacao) return false;
      return true;
    });
  }

  function filteredRequests(state) {
    const status = els.requestStatus.value;
    const turmaId = els.requestTurma.value;
    const dateKey = els.requestData.value;
    return state.solicitacoes.filter(
      (s) =>
        (!status || s.status === status) &&
        (!turmaId || alunoOf(s).turmaId === turmaId) &&
        (!dateKey || s.data === dateKey)
    );
  }

  function renderAll() {
    const state = data.getState();
    renderCounters(state);
    renderOverview(state);
    historyTable.setRows(filteredMovements(state));
    requestsTable.setRows(filteredRequests(state));
    alertsTable.setRows(state.movimentos.filter((m) => m.situacao === "sem_liberacao"));
  }

  /* ---------- Ações ---------- */

  function approve(id) {
    const solicitacao = data.commit((state) => domain.decideRequest(state, id, "aprovada"));
    if (!solicitacao) {
      ui.toast("Esta solicitação já foi analisada ou cancelada.", { tone: "warning" });
      return;
    }
    ui.toast(`${alunoOf(solicitacao).nome}: saída liberada para ${requestWhen(solicitacao).toLowerCase()}.`, {
      title: "Solicitação aprovada",
      tone: "success",
    });
  }

  function openRefuse(id) {
    const solicitacao = data.getState().solicitacoes.find((s) => s.id === id);
    if (!solicitacao || solicitacao.status !== "pendente") return;
    refusingId = id;
    els.refuseSummary.textContent = `${alunoOf(solicitacao).nome} · ${requestWhen(solicitacao)} · “${solicitacao.motivo}”`;
    els.refuseReason.value = "";
    els.refuseReasonError.textContent = "";
    els.refuseReason.removeAttribute("aria-invalid");
    els.detailsDialog.close();
    els.refuseDialog.showModal();
    els.refuseReason.focus();
  }

  function openDetails(id) {
    const state = data.getState();
    const solicitacao = state.solicitacoes.find((s) => s.id === id);
    if (!solicitacao) return;
    const aluno = alunoOf(solicitacao);
    const rows = [
      ["Aluno", `${aluno.nome} (matrícula ${aluno.matricula})`],
      ["Turma", catalog.turmaLabel(aluno.turmaId)],
      ["Responsável", catalog.getResponsavel(solicitacao.responsavelId).nome],
      ["Saída prevista", `${time.formatDate(solicitacao.data)} às ${solicitacao.horario}`],
      ["Motivo", solicitacao.motivo],
      ["Enviada em", time.formatTimestamp(solicitacao.criadaEm)],
    ];
    if (solicitacao.decididaEm) rows.push(["Analisada em", time.formatTimestamp(solicitacao.decididaEm)]);
    if (solicitacao.justificativa) rows.push(["Justificativa", solicitacao.justificativa]);
    if (solicitacao.utilizadaEm) rows.push(["Saída registrada", time.formatTimestamp(solicitacao.utilizadaEm)]);

    els.detailsBody.innerHTML = `
      <p>${ui.requestBadge(solicitacao)}</p>
      <dl class="details-list">${rows.map(([label, value]) => `<dt>${escape(label)}</dt><dd>${escape(value)}</dd>`).join("")}</dl>`;
    els.detailsActions.innerHTML =
      solicitacao.status === "pendente"
        ? `<button class="danger-button" type="button" data-action="refuse" data-id="${id}">${ui.icon("thumbsDown")}Recusar</button>
           <button class="success-button" type="button" data-action="approve" data-id="${id}">${ui.icon("thumbsUp")}Aprovar</button>`
        : '<button class="ghost-button" type="button" data-close-dialog>Fechar</button>';
    els.detailsDialog.showModal();
  }

  function resolve(id) {
    const movimento = data.commit((state) => domain.resolveAlert(state, id));
    if (movimento) ui.toast(`Ocorrência de ${alunoOf(movimento).nome} marcada como verificada.`, { tone: "success" });
  }

  const ACTIONS = { approve, refuse: openRefuse, details: openDetails, resolve };

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-action]");
    if (button && ACTIONS[button.dataset.action]) {
      if (button.dataset.action === "approve" && els.detailsDialog.open) els.detailsDialog.close();
      ACTIONS[button.dataset.action](button.dataset.id);
      return;
    }
    const closer = event.target.closest("[data-close-dialog]");
    if (closer) closer.closest("dialog").close();
  });

  els.refuseForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const reason = els.refuseReason.value.trim();
    if (reason.length < MIN_REFUSAL_LENGTH) {
      els.refuseReasonError.textContent = "Escreva uma justificativa com pelo menos 5 caracteres.";
      els.refuseReason.setAttribute("aria-invalid", "true");
      els.refuseReason.focus();
      return;
    }
    const solicitacao = data.commit((state) => domain.decideRequest(state, refusingId, "recusada", reason));
    els.refuseDialog.close();
    if (solicitacao) {
      ui.toast(`O responsável por ${alunoOf(solicitacao).nome} verá a justificativa no painel.`, {
        title: "Solicitação recusada",
        tone: "info",
      });
    }
  });

  els.refuseReason.addEventListener("input", () => {
    els.refuseReasonError.textContent = "";
    els.refuseReason.removeAttribute("aria-invalid");
  });

  /* ---------- Navegação ---------- */

  const shell = ui.initShell();

  function goToHistory(situacao) {
    els.historyFilters.reset();
    els.filterData.value = els.overviewDate.value;
    els.filterSituacao.value = situacao;
    renderAll();
    shell.go("movimentacoes");
  }

  document.addEventListener("click", (event) => {
    const historyLink = event.target.closest("[data-goto-history]");
    if (historyLink) {
      goToHistory(historyLink.dataset.gotoHistory);
      return;
    }
    const sectionLink = event.target.closest("[data-goto]");
    if (sectionLink) {
      els.requestStatus.value = "pendente";
      renderAll();
      shell.go(sectionLink.dataset.goto);
    }
  });

  [els.historyFilters, els.requestFilters].forEach((form) => {
    form.addEventListener("change", renderAll);
    form.addEventListener("submit", (event) => event.preventDefault());
    // O "reset" do formulário limpa os campos antes de redesenhar.
    form.addEventListener("reset", () => window.setTimeout(renderAll));
  });
  els.overviewDate.addEventListener("change", renderAll);

  /* ---------- Avisos de novidades (outra aba ou catraca) ---------- */

  function announceChanges(state) {
    state.solicitacoes
      .filter((s) => !knownRequests.has(s.id) && s.status === "pendente")
      .forEach((s) =>
        ui.toast(`${alunoOf(s).nome}: saída prevista para ${requestWhen(s).toLowerCase()}.`, {
          title: "Nova solicitação de liberação",
          tone: "warning",
        })
      );
    state.movimentos
      .filter((m) => !knownMovements.has(m.id) && m.situacao === "sem_liberacao")
      .forEach((m) =>
        ui.toast(`${alunoOf(m).nome} saiu às ${time.timeOf(m.timestamp)} sem liberação aprovada.`, {
          title: "Alerta: saída sem liberação",
          tone: "danger",
        })
      );
  }

  function rememberIds(state) {
    knownMovements = new Set(state.movimentos.map((m) => m.id));
    knownRequests = new Set(state.solicitacoes.map((s) => s.id));
  }

  data.subscribe(({ reset }) => {
    const state = data.getState();
    if (!reset) announceChanges(state);
    rememberIds(state);
    renderAll();
  });

  /* ---------- Inicialização ---------- */

  ui.setupHeader(auth.currentUser());
  els.overviewDate.value = time.todayKey();
  fillSelect(els.filterAluno, "Todos os alunos", catalog.alunos.map((a) => ({ value: a.id, label: a.nome })));
  const turmaOptions = catalog.turmas.map((t) => ({ value: t.id, label: catalog.turmaLabel(t.id) }));
  fillSelect(els.filterTurma, "Todas as turmas", turmaOptions);
  fillSelect(els.requestTurma, "Todas as turmas", turmaOptions);
  els.filterData.value = time.todayKey();
  els.requestStatus.value = "pendente";

  rememberIds(data.getState());
  renderAll();
})();
