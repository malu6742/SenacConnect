/*
 * Senac Connect: painel do responsável.
 * Mostra apenas os alunos vinculados à conta fictícia conectada nesta aba.
 */
(function () {
  "use strict";

  const { auth, data, catalog, domain, time, ui, constants, MOVEMENT_STATUS, REQUEST_STATUS } = window.SC;
  if (!auth.requireRole("responsavel")) return;

  const MIN_REASON_LENGTH = 10;
  const MAX_REASON_LENGTH = 300;
  const RECENT_LIMIT = 5;
  const NOTIFICATION_ICON = { entrada: "entrada", saida: "saida", ocorrencia: "alert", solicitacao: "clipboard" };
  const NOTIFICATION_TONE = { entrada: "info", saida: "neutral", ocorrencia: "danger", solicitacao: "warning" };

  const user = auth.currentUser();
  const students = catalog.alunosDoResponsavel(user.id);
  const studentIds = new Set(students.map((aluno) => aluno.id));

  const $ = (id) => document.getElementById(id);
  const escape = ui.escapeHtml;
  const els = {
    switcher: $("studentSwitcher"),
    subtitle: $("studentSubtitle"),
    statusCards: $("statusCards"),
    recentNotifications: $("recentNotifications"),
    recentRequests: $("recentRequests"),
    allNotifications: $("allNotifications"),
    navUnread: $("navUnread"),
    markAllRead: $("markAllRead"),
    form: $("requestForm"),
    reqAluno: $("reqAluno"),
    reqData: $("reqData"),
    reqHora: $("reqHora"),
    reqHoraHint: $("reqHoraHint"),
    reqMotivo: $("reqMotivo"),
    reqMotivoCount: $("reqMotivoCount"),
    reqFormError: $("reqFormError"),
    historyFilters: $("historyFilters"),
    histTipo: $("histTipo"),
    histPeriodo: $("histPeriodo"),
  };

  let selectedId = readSelectedStudent();
  let knownStatuses = new Map();
  let knownMovements = new Set();

  function readSelectedStudent() {
    try {
      const stored = window.sessionStorage.getItem(constants.SELECTED_STUDENT_KEY);
      return studentIds.has(stored) ? stored : students[0].id;
    } catch (error) {
      return students[0].id;
    }
  }

  function selectStudent(id) {
    selectedId = id;
    try {
      window.sessionStorage.setItem(constants.SELECTED_STUDENT_KEY, id);
    } catch (error) {
      // Preferência apenas da aba; pode ser ignorada.
    }
    els.reqAluno.value = id;
    updateTimeHint();
    renderAll();
  }

  /* ---------- Consultas restritas à conta ---------- */

  const myMovements = (state, alunoId = selectedId) =>
    state.movimentos.filter((m) => m.alunoId === alunoId).sort((a, b) => b.timestamp - a.timestamp);

  const myRequests = (state, alunoId = selectedId) =>
    state.solicitacoes.filter((s) => s.alunoId === alunoId && s.responsavelId === user.id);

  const myNotifications = (state, alunoId = selectedId) =>
    state.notificacoes
      .filter((n) => n.responsavelId === user.id && n.alunoId === alunoId)
      .sort((a, b) => b.timestamp - a.timestamp);

  /* ---------- Cartões de situação ---------- */

  function currentSituation(movimentos) {
    const last = movimentos[0];
    const today = time.todayKey();
    if (!last) return { tone: "neutral", icon: "info", title: "Sem registros", text: "Nenhuma movimentação encontrada." };
    if (time.dateKeyOf(last.timestamp) !== today) {
      return { tone: "neutral", icon: "clock", title: "Sem registro hoje", text: `Último registro: ${time.formatTimestamp(last.timestamp).toLowerCase()}.` };
    }
    if (last.tipo === "entrada") {
      return { tone: "success", icon: "building", title: "Na escola", text: `Entrada às ${time.timeOf(last.timestamp)}.` };
    }
    if (last.situacao === "sem_liberacao") {
      return { tone: "danger", icon: "alert", title: "Saída sem liberação", text: `Saiu às ${time.timeOf(last.timestamp)} sem autorização registrada.` };
    }
    return { tone: "neutral", icon: "saida", title: "Fora da escola", text: `${MOVEMENT_STATUS[last.situacao].label} às ${time.timeOf(last.timestamp)}.` };
  }

  function statusCard({ tone, icon, label, title, text, extra = "" }) {
    return `
      <article class="status-card status-card--${tone}">
        <span class="status-card__icon">${ui.icon(icon)}</span>
        <div>
          <p class="status-card__label">${escape(label)}</p>
          <p class="status-card__value">${escape(title)}</p>
          <p class="status-card__text">${escape(text)}</p>
          ${extra}
        </div>
      </article>`;
  }

  function renderStatusCards(state) {
    const aluno = catalog.getAluno(selectedId);
    const turma = catalog.getTurma(aluno.turmaId);
    const movimentos = myMovements(state);
    const lastIn = movimentos.find((m) => m.tipo === "entrada");
    const lastOut = movimentos.find((m) => m.tipo === "saida");
    const situation = currentSituation(movimentos);

    els.subtitle.textContent = `${aluno.nome} · matrícula ${aluno.matricula} · ${catalog.turmaLabel(aluno.turmaId)} (${turma.inicio} às ${turma.fim})`;
    els.statusCards.innerHTML = [
      statusCard({
        tone: "info",
        icon: "entrada",
        label: "Última chegada",
        title: lastIn ? time.timeOf(lastIn.timestamp) : "—",
        text: lastIn ? time.formatDay(time.dateKeyOf(lastIn.timestamp)) : "Sem registro",
      }),
      statusCard({
        tone: lastOut ? MOVEMENT_STATUS[lastOut.situacao].tone : "neutral",
        icon: "saida",
        label: "Última saída",
        title: lastOut ? time.timeOf(lastOut.timestamp) : "—",
        text: lastOut ? time.formatDay(time.dateKeyOf(lastOut.timestamp)) : "Sem registro",
        extra: lastOut ? ui.badge(MOVEMENT_STATUS[lastOut.situacao]) : "",
      }),
      statusCard({ ...situation, label: "Situação atual" }),
    ].join("");
  }

  /* ---------- Notificações ---------- */

  function notificationList(notificacoes, emptyTitle) {
    if (!notificacoes.length) return ui.emptyState(emptyTitle);
    return `<ul class="notification-list">${notificacoes
      .map(
        (n) => `
        <li class="notification notification--${NOTIFICATION_TONE[n.tipo]} ${n.lida ? "" : "is-unread"}">
          <span class="notification__icon">${ui.icon(NOTIFICATION_ICON[n.tipo])}</span>
          <div class="notification__body">
            <p class="notification__title">${escape(n.titulo)}${n.lida ? "" : '<span class="dot" aria-label="Não lida"></span>'}</p>
            <p>${escape(n.mensagem)}</p>
            <time>${escape(time.formatTimestamp(n.timestamp))}</time>
          </div>
        </li>`
      )
      .join("")}</ul>`;
  }

  function renderNotifications(state) {
    const all = myNotifications(state);
    const unread = state.notificacoes.filter((n) => n.responsavelId === user.id && !n.lida).length;
    els.navUnread.hidden = unread === 0;
    els.navUnread.textContent = unread;
    els.navUnread.setAttribute("aria-label", `${unread} não lidas`);
    els.markAllRead.disabled = !all.some((n) => !n.lida);
    els.recentNotifications.innerHTML = notificationList(all.slice(0, RECENT_LIMIT), "Nenhuma notificação ainda");
    els.allNotifications.innerHTML = notificationList(all, "Nenhuma notificação para este aluno");
  }

  /* ---------- Solicitações ---------- */

  function renderRecentRequests(state) {
    const requests = myRequests(state).sort((a, b) => b.criadaEm - a.criadaEm).slice(0, RECENT_LIMIT);
    els.recentRequests.innerHTML = requests.length
      ? `<ul class="request-list">${requests
          .map(
            (s) => `
            <li class="request-item">
              <div class="request-item__main">
                <span class="request-item__when">${ui.icon("clock")}${escape(time.formatDay(s.data))} às ${s.horario}</span>
                <p>${escape(s.motivo)}</p>
                ${s.justificativa ? `<small>Resposta da escola: ${escape(s.justificativa)}</small>` : ""}
              </div>
              ${ui.requestBadge(s)}
            </li>`
          )
          .join("")}</ul>`
      : ui.emptyState("Nenhuma solicitação enviada", "Use “Solicitar liberação” para pedir uma saída antecipada.");
  }

  const requestsTable = ui.createDataTable($("requestsTable"), {
    exportName: "minhas-solicitacoes",
    defaultSort: { key: "enviada", dir: "desc" },
    emptyTitle: "Nenhuma solicitação enviada para este aluno",
    emptyText: "Preencha o formulário acima para enviar a primeira.",
    rowClass: (s) => (s.status === "pendente" ? "row--warning" : ""),
    searchText: (s) => `${s.motivo} ${REQUEST_STATUS[s.status].label} ${time.formatDate(s.data)}`,
    columns: [
      {
        key: "prevista",
        label: "Saída prevista",
        render: (s) => `${escape(time.formatDate(s.data))}<small class="cell-sub">${s.horario}</small>`,
        sortValue: (s) => `${s.data} ${s.horario}`,
        csv: (s) => `${time.formatDate(s.data)} ${s.horario}`,
      },
      { key: "motivo", label: "Motivo", render: (s) => `<span class="cell-clamp">${escape(s.motivo)}</span>`, sortable: false, csv: (s) => s.motivo },
      {
        key: "enviada",
        label: "Enviada em",
        render: (s) => escape(time.formatTimestamp(s.criadaEm)),
        sortValue: (s) => s.criadaEm,
        csv: (s) => time.formatTimestamp(s.criadaEm),
      },
      {
        key: "status",
        label: "Situação",
        render: (s) => `${ui.requestBadge(s)}${s.justificativa ? `<small class="cell-sub">${escape(s.justificativa)}</small>` : ""}`,
        sortValue: (s) => REQUEST_STATUS[s.status].label,
        csv: (s) => REQUEST_STATUS[s.status].label,
      },
      {
        key: "acoes",
        label: "Ações",
        sortable: false,
        className: "cell-actions",
        render: (s) =>
          s.status === "pendente"
            ? `<button class="ghost-button ghost-button--small" type="button" data-cancel="${s.id}">Cancelar</button>`
            : '<span class="cell-sub">—</span>',
      },
    ],
  });

  /* ---------- Histórico ---------- */

  const historyTable = ui.createDataTable($("historyTable"), {
    exportName: "historico-aluno",
    defaultSort: { key: "quando", dir: "desc" },
    emptyTitle: "Nenhuma movimentação no período",
    emptyText: "Amplie o período ou limpe os filtros.",
    rowClass: (m) => (m.situacao === "sem_liberacao" ? "row--danger" : ""),
    searchText: (m) => `${MOVEMENT_STATUS[m.situacao].label} ${time.formatDate(time.dateKeyOf(m.timestamp))}`,
    columns: [
      {
        key: "quando",
        label: "Data",
        render: (m) => escape(time.formatDate(time.dateKeyOf(m.timestamp))),
        sortValue: (m) => m.timestamp,
        csv: (m) => time.formatDate(time.dateKeyOf(m.timestamp)),
      },
      { key: "hora", label: "Horário", render: (m) => time.timeOf(m.timestamp), sortValue: (m) => time.timeOf(m.timestamp), csv: (m) => time.timeOf(m.timestamp) },
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
        render: (m) => ui.badge(MOVEMENT_STATUS[m.situacao]),
        sortValue: (m) => MOVEMENT_STATUS[m.situacao].label,
        csv: (m) => MOVEMENT_STATUS[m.situacao].label,
      },
    ],
  });

  function filteredHistory(state) {
    const tipo = els.histTipo.value;
    const days = Number(els.histPeriodo.value);
    const since = days ? time.addDays(time.fromKeys(time.todayKey()), -(days - 1)).getTime() : 0;
    return myMovements(state).filter((m) => (!tipo || m.tipo === tipo) && m.timestamp >= since);
  }

  /* ---------- Renderização ---------- */

  function renderSwitcher() {
    els.switcher.innerHTML = students
      .map(
        (aluno) => `
        <button class="student-chip" type="button" data-student="${aluno.id}" aria-pressed="${aluno.id === selectedId}">
          <span class="avatar avatar--small" aria-hidden="true">${escape(ui.initials(aluno.nome))}</span>
          <span><strong>${escape(aluno.nome)}</strong><small>${escape(catalog.turmaLabel(aluno.turmaId))}</small></span>
        </button>`
      )
      .join("");
  }

  function renderAll() {
    const state = data.getState();
    renderSwitcher();
    renderStatusCards(state);
    renderNotifications(state);
    renderRecentRequests(state);
    requestsTable.setRows(myRequests(state));
    historyTable.setRows(filteredHistory(state));
  }

  /* ---------- Formulário de solicitação ---------- */

  function setError(input, message) {
    const errorEl = $(`${input.id}Error`);
    errorEl.textContent = message;
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
  }

  function updateTimeHint() {
    const aluno = catalog.getAluno(els.reqAluno.value);
    if (!aluno) return;
    const turma = catalog.getTurma(aluno.turmaId);
    els.reqHoraHint.textContent = `Turno ${turma.turno.toLowerCase()}: ${turma.inicio} às ${turma.fim}.`;
    els.reqHora.min = turma.inicio;
    els.reqHora.max = turma.fim;
  }

  const validators = {
    reqAluno: () => (studentIds.has(els.reqAluno.value) ? "" : "Selecione um aluno vinculado à sua conta."),
    reqData() {
      const value = els.reqData.value;
      if (!value) return "Informe a data da saída.";
      const today = time.todayKey();
      const limit = time.toDateKey(time.addDays(new Date(), constants.MAX_REQUEST_DAYS_AHEAD));
      if (value < today) return "A data não pode estar no passado.";
      if (value > limit) return `Escolha uma data nos próximos ${constants.MAX_REQUEST_DAYS_AHEAD} dias.`;
      if (time.isWeekend(time.fromKeys(value))) return "Não há aula nesse dia. Escolha um dia útil.";
      return "";
    },
    reqHora() {
      const value = els.reqHora.value;
      if (!value) return "Informe o horário previsto.";
      const aluno = catalog.getAluno(els.reqAluno.value);
      if (aluno) {
        const turma = catalog.getTurma(aluno.turmaId);
        const minutes = time.minutesOf(value);
        if (minutes < time.minutesOf(turma.inicio) || minutes >= time.minutesOf(turma.fim)) {
          return `Escolha um horário entre ${turma.inicio} e ${turma.fim}. Fora do turno a saída não precisa de liberação.`;
        }
      }
      if (els.reqData.value === time.todayKey() && value <= time.toTimeKey(new Date())) {
        return "Esse horário de hoje já passou.";
      }
      return "";
    },
    reqMotivo() {
      const length = els.reqMotivo.value.trim().length;
      if (!length) return "Descreva o motivo da saída.";
      if (length < MIN_REASON_LENGTH) return `Escreva pelo menos ${MIN_REASON_LENGTH} caracteres.`;
      if (length > MAX_REASON_LENGTH) return `Use no máximo ${MAX_REASON_LENGTH} caracteres.`;
      return "";
    },
  };

  function validateField(input) {
    const message = validators[input.id]();
    setError(input, message);
    return !message;
  }

  function findConflict(state) {
    return state.solicitacoes.find(
      (s) =>
        s.alunoId === els.reqAluno.value &&
        s.data === els.reqData.value &&
        (s.status === "pendente" || (s.status === "aprovada" && !s.utilizadaEm))
    );
  }

  const formInputs = [els.reqAluno, els.reqData, els.reqHora, els.reqMotivo];

  formInputs.forEach((input) => {
    input.addEventListener("blur", () => {
      if (input.value) validateField(input);
    });
    input.addEventListener("input", () => {
      if (input.hasAttribute("aria-invalid")) validateField(input);
      els.reqFormError.textContent = "";
    });
  });

  els.reqMotivo.addEventListener("input", () => {
    els.reqMotivoCount.textContent = `${els.reqMotivo.value.trim().length}/${MAX_REASON_LENGTH}`;
  });

  els.reqAluno.addEventListener("change", () => {
    updateTimeHint();
    if (els.reqHora.value) validateField(els.reqHora);
  });

  els.form.addEventListener("submit", (event) => {
    event.preventDefault();
    els.reqFormError.textContent = "";
    const results = formInputs.map(validateField);
    if (results.includes(false)) {
      els.form.querySelector("[aria-invalid=true]").focus();
      return;
    }

    const conflict = findConflict(data.getState());
    if (conflict) {
      els.reqFormError.textContent = `Já existe uma solicitação ${REQUEST_STATUS[conflict.status].label.toLowerCase()} para esse aluno em ${time.formatDate(conflict.data)} (${conflict.horario}).`;
      return;
    }

    const solicitacao = data.commit((state) =>
      domain.createRequest(state, {
        alunoId: els.reqAluno.value,
        responsavelId: user.id,
        data: els.reqData.value,
        horario: els.reqHora.value,
        motivo: els.reqMotivo.value.trim(),
      })
    );
    knownStatuses.set(solicitacao.id, solicitacao.status);

    els.form.reset();
    els.reqAluno.value = solicitacao.alunoId;
    els.reqMotivoCount.textContent = `0/${MAX_REASON_LENGTH}`;
    if (solicitacao.alunoId !== selectedId) selectStudent(solicitacao.alunoId);
    ui.toast(`Pedido para ${time.formatDay(solicitacao.data).toLowerCase()} às ${solicitacao.horario} enviado com status “Pendente”.`, {
      title: "Solicitação enviada",
      tone: "success",
    });
  });

  /* ---------- Eventos gerais ---------- */

  document.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-student]");
    if (chip) {
      selectStudent(chip.dataset.student);
      return;
    }
    const cancel = event.target.closest("[data-cancel]");
    if (cancel) {
      if (!window.confirm("Cancelar esta solicitação de saída?")) return;
      const result = data.commit((state) => domain.cancelRequest(state, cancel.dataset.cancel, user.id));
      ui.toast(result ? "A solicitação foi cancelada." : "Esta solicitação já foi analisada pela escola.", {
        tone: result ? "info" : "warning",
      });
    }
  });

  els.markAllRead.addEventListener("click", () => {
    data.commit((state) => domain.markNotificationsRead(state, user.id, selectedId));
    ui.toast("Notificações marcadas como lidas.", { tone: "success" });
  });

  els.historyFilters.addEventListener("change", renderAll);
  els.historyFilters.addEventListener("reset", () => window.setTimeout(renderAll));

  /* ---------- Avisos vindos do painel institucional ou da catraca ---------- */

  function announceChanges(state) {
    state.solicitacoes
      .filter((s) => s.responsavelId === user.id && knownStatuses.has(s.id) && knownStatuses.get(s.id) !== s.status)
      .filter((s) => s.status === "aprovada" || s.status === "recusada")
      .forEach((s) =>
        ui.toast(`${catalog.getAluno(s.alunoId).nome} · ${time.formatDay(s.data)} às ${s.horario}.`, {
          title: s.status === "aprovada" ? "Solicitação aprovada" : "Solicitação recusada",
          tone: s.status === "aprovada" ? "success" : "danger",
        })
      );
    state.movimentos
      .filter((m) => studentIds.has(m.alunoId) && !knownMovements.has(m.id))
      .forEach((m) => {
        const aluno = catalog.getAluno(m.alunoId);
        ui.toast(`${aluno.nome} · ${time.timeOf(m.timestamp)}`, {
          title: m.situacao === "sem_liberacao" ? "Ocorrência: saída sem liberação" : MOVEMENT_STATUS[m.situacao].label,
          tone: m.situacao === "sem_liberacao" ? "danger" : "info",
        });
      });
  }

  function remember(state) {
    knownStatuses = new Map(state.solicitacoes.map((s) => [s.id, s.status]));
    knownMovements = new Set(state.movimentos.map((m) => m.id));
  }

  data.subscribe(({ external, reset }) => {
    const state = data.getState();
    if (external && !reset) announceChanges(state);
    remember(state);
    renderAll();
  });

  /* ---------- Inicialização ---------- */

  ui.setupHeader(user);
  ui.initShell();
  els.reqAluno.innerHTML = students
    .map((aluno) => `<option value="${aluno.id}">${escape(aluno.nome)} · ${escape(catalog.turmaLabel(aluno.turmaId))}</option>`)
    .join("");
  els.reqAluno.value = selectedId;
  els.reqData.min = time.todayKey();
  els.reqData.max = time.toDateKey(time.addDays(new Date(), constants.MAX_REQUEST_DAYS_AHEAD));
  updateTimeHint();

  remember(data.getState());
  renderAll();
})();
