/*
 * Senac Connect: núcleo compartilhado do protótipo.
 *
 * Reúne os dados fictícios, a sessão simulada e os utilitários usados por
 * todas as páginas. Não existe back-end: tudo fica no navegador.
 *
 * ATENÇÃO: a autenticação é apenas demonstrativa. As credenciais estão no
 * próprio código-fonte e qualquer pessoa com acesso ao navegador pode ler ou
 * alterar os dados. Não use este mecanismo para proteger dados reais.
 */
(function () {
  "use strict";

  const DATA_KEY = "senacConnect:dados:v1";
  const SESSION_KEY = "senacConnect:sessao";
  const SELECTED_STUDENT_KEY = "senacConnect:alunoSelecionado";
  const DATA_VERSION = 1;
  const AUTHORIZATION_TOLERANCE_MINUTES = 30;
  const MAX_REQUEST_DAYS_AHEAD = 30;
  const SEED_SCHOOL_DAYS = 6;
  const ABSENCE_PROBABILITY = 0.07;
  const MAX_VISIBLE_TOASTS = 4;

  /* ------------------------------------------------------------------ */
  /* Catálogo fictício (dados fixos)                                     */
  /* ------------------------------------------------------------------ */

  const TURMAS = [
    { id: "INF-M", nome: "Técnico em Informática", turno: "Manhã", inicio: "07:00", fim: "11:30" },
    { id: "ADM-T", nome: "Técnico em Administração", turno: "Tarde", inicio: "13:00", fim: "17:30" },
    { id: "ENF-N", nome: "Técnico em Enfermagem", turno: "Noite", inicio: "18:30", fim: "22:00" },
  ];

  const ALUNOS = [
    { id: "a1", nome: "Paulo Mateus Silva", matricula: "2026001", turmaId: "INF-M", responsavelId: "r1" },
    { id: "a2", nome: "Laura Silva Costa", matricula: "2026002", turmaId: "ADM-T", responsavelId: "r1" },
    { id: "a3", nome: "Juliana Alves Pereira", matricula: "2026003", turmaId: "INF-M", responsavelId: "r2" },
    { id: "a4", nome: "Lucas Oliveira Santos", matricula: "2026004", turmaId: "INF-M", responsavelId: "r3" },
    { id: "a5", nome: "Ana Souza Lima", matricula: "2026005", turmaId: "ADM-T", responsavelId: "r4" },
    { id: "a6", nome: "Rafael Lima Barros", matricula: "2026006", turmaId: "ADM-T", responsavelId: "r5" },
    { id: "a7", nome: "Beatriz Santos Rocha", matricula: "2026007", turmaId: "ENF-N", responsavelId: "r6" },
    { id: "a8", nome: "Gabriel Rocha Nunes", matricula: "2026008", turmaId: "ENF-N", responsavelId: "r7" },
  ];

  // Apenas r1 e r2 têm credenciais de demonstração; os demais existem só como dados.
  const RESPONSAVEIS = [
    { id: "r1", nome: "Maria Silva", email: "maria@demo.senac.br", senha: "demo123" },
    { id: "r2", nome: "Carlos Pereira", email: "carlos@demo.senac.br", senha: "demo123" },
    { id: "r3", nome: "Fernanda Oliveira" },
    { id: "r4", nome: "Roberto Souza" },
    { id: "r5", nome: "Patrícia Lima" },
    { id: "r6", nome: "Marcos Santos" },
    { id: "r7", nome: "Helena Rocha" },
  ];

  const USUARIOS_INSTITUCIONAIS = [
    { id: "i1", nome: "Secretaria Escolar", email: "secretaria@demo.senac.br", senha: "senac123" },
  ];

  const MOVEMENT_STATUS = {
    entrada: { label: "Entrada", tone: "info", icon: "entrada" },
    regular: { label: "Saída regular", tone: "neutral", icon: "saida" },
    autorizada: { label: "Saída autorizada", tone: "success", icon: "check" },
    sem_liberacao: { label: "Saída sem liberação", tone: "danger", icon: "alert" },
  };

  const REQUEST_STATUS = {
    pendente: { label: "Pendente", tone: "warning", icon: "clock" },
    aprovada: { label: "Aprovada", tone: "success", icon: "check" },
    recusada: { label: "Recusada", tone: "danger", icon: "x" },
    cancelada: { label: "Cancelada", tone: "neutral", icon: "x" },
  };

  const findById = (list, id) => list.find((item) => item.id === id) || null;

  const catalog = {
    turmas: TURMAS,
    alunos: ALUNOS,
    responsaveis: RESPONSAVEIS,
    getTurma: (id) => findById(TURMAS, id),
    getAluno: (id) => findById(ALUNOS, id),
    getResponsavel: (id) => findById(RESPONSAVEIS, id),
    alunosDoResponsavel: (responsavelId) =>
      ALUNOS.filter((aluno) => aluno.responsavelId === responsavelId),
    turmaLabel(turmaId) {
      const turma = findById(TURMAS, turmaId);
      return turma ? `${turma.nome} · ${turma.turno}` : "";
    },
  };

  /* ------------------------------------------------------------------ */
  /* Datas e horários                                                    */
  /* ------------------------------------------------------------------ */

  const pad = (value) => String(value).padStart(2, "0");

  const time = {
    toDateKey: (date) =>
      `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    toTimeKey: (date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`,
    todayKey: () => time.toDateKey(new Date()),
    fromKeys(dateKey, timeKey = "00:00") {
      const [year, month, day] = dateKey.split("-").map(Number);
      const [hours, minutes] = timeKey.split(":").map(Number);
      return new Date(year, month - 1, day, hours, minutes);
    },
    minutesOf(timeKey) {
      const [hours, minutes] = timeKey.split(":").map(Number);
      return hours * 60 + minutes;
    },
    fromMinutes: (total) => `${pad(Math.floor(total / 60))}:${pad(total % 60)}`,
    addDays(date, amount) {
      const result = new Date(date);
      result.setDate(result.getDate() + amount);
      return result;
    },
    isWeekend: (date) => date.getDay() === 0 || date.getDay() === 6,
    nextSchoolDay(date) {
      let next = time.addDays(date, 1);
      while (time.isWeekend(next)) next = time.addDays(next, 1);
      return next;
    },
    formatDate(dateKey) {
      const [year, month, day] = dateKey.split("-");
      return `${day}/${month}/${year}`;
    },
    formatDay(dateKey) {
      const today = new Date();
      if (dateKey === time.toDateKey(today)) return "Hoje";
      if (dateKey === time.toDateKey(time.addDays(today, -1))) return "Ontem";
      if (dateKey === time.toDateKey(time.addDays(today, 1))) return "Amanhã";
      return time.formatDate(dateKey);
    },
    dateKeyOf: (timestamp) => time.toDateKey(new Date(timestamp)),
    timeOf: (timestamp) => time.toTimeKey(new Date(timestamp)),
    formatTimestamp: (timestamp) =>
      `${time.formatDay(time.dateKeyOf(timestamp))}, ${time.timeOf(timestamp)}`,
  };

  /* ------------------------------------------------------------------ */
  /* Dados dinâmicos (movimentações, solicitações e notificações)        */
  /* ------------------------------------------------------------------ */

  let idCounter = 0;
  function createId(prefix) {
    idCounter += 1;
    return `${prefix}-${Date.now().toString(36)}-${idCounter}-${Math.random().toString(36).slice(2, 6)}`;
  }

  const firstName = (aluno) => aluno.nome.split(" ")[0];

  function buildMovementNotification(movimento) {
    const aluno = catalog.getAluno(movimento.alunoId);
    const hora = time.timeOf(movimento.timestamp);
    const nome = firstName(aluno);
    const messages = {
      entrada: ["Chegada registrada", `${nome} chegou ao Senac às ${hora}.`],
      regular: ["Saída registrada", `${nome} saiu às ${hora}, no fim do turno.`],
      autorizada: ["Saída autorizada", `${nome} saiu às ${hora} com liberação aprovada.`],
      sem_liberacao: [
        "Ocorrência: saída sem liberação",
        `${nome} saiu às ${hora} sem liberação registrada. A coordenação foi alertada.`,
      ],
    };
    const [titulo, mensagem] = messages[movimento.situacao];
    return {
      tipo: movimento.situacao === "sem_liberacao" ? "ocorrencia" : movimento.tipo,
      titulo,
      mensagem,
    };
  }

  function pushNotification(state, { responsavelId, alunoId, tipo, titulo, mensagem, timestamp, lida = false }) {
    state.notificacoes.push({
      id: createId("n"),
      responsavelId,
      alunoId,
      tipo,
      titulo,
      mensagem,
      timestamp,
      lida,
    });
  }

  /** Registra uma movimentação já classificada e avisa o responsável. */
  function appendMovement(state, { alunoId, tipo, situacao, timestamp, solicitacaoId = null }, options = {}) {
    const movimento = {
      id: createId("m"),
      alunoId,
      tipo,
      situacao,
      timestamp,
      solicitacaoId,
      origem: "catraca-simulada",
      alertaResolvido: situacao === "sem_liberacao" ? Boolean(options.alertaResolvido) : null,
    };
    state.movimentos.push(movimento);

    const aluno = catalog.getAluno(alunoId);
    pushNotification(state, {
      responsavelId: aluno.responsavelId,
      alunoId,
      timestamp,
      lida: Boolean(options.lida),
      ...buildMovementNotification(movimento),
    });
    return movimento;
  }

  function createRequest(state, { alunoId, responsavelId, data, horario, motivo }, extra = {}) {
    const solicitacao = {
      id: createId("s"),
      alunoId,
      responsavelId,
      data,
      horario,
      motivo,
      status: "pendente",
      criadaEm: Date.now(),
      decididaEm: null,
      justificativa: "",
      utilizadaEm: null,
      ...extra,
    };
    state.solicitacoes.push(solicitacao);
    return solicitacao;
  }

  function decideRequest(state, solicitacaoId, status, justificativa = "", decidedAt = Date.now(), lida = false) {
    const solicitacao = findById(state.solicitacoes, solicitacaoId);
    if (!solicitacao || solicitacao.status !== "pendente") return null;

    solicitacao.status = status;
    solicitacao.decididaEm = decidedAt;
    solicitacao.justificativa = justificativa;

    const aluno = catalog.getAluno(solicitacao.alunoId);
    const quando = `${time.formatDate(solicitacao.data)} às ${solicitacao.horario}`;
    const approved = status === "aprovada";
    pushNotification(state, {
      responsavelId: solicitacao.responsavelId,
      alunoId: solicitacao.alunoId,
      tipo: "solicitacao",
      titulo: approved ? "Solicitação aprovada" : "Solicitação recusada",
      mensagem: approved
        ? `A saída de ${firstName(aluno)} em ${quando} foi liberada.`
        : `A saída de ${firstName(aluno)} em ${quando} não foi liberada. Motivo: ${justificativa}`,
      timestamp: decidedAt,
      lida,
    });
    return solicitacao;
  }

  function cancelRequest(state, solicitacaoId, responsavelId) {
    const solicitacao = findById(state.solicitacoes, solicitacaoId);
    if (!solicitacao || solicitacao.responsavelId !== responsavelId || solicitacao.status !== "pendente") {
      return null;
    }
    solicitacao.status = "cancelada";
    solicitacao.decididaEm = Date.now();
    return solicitacao;
  }

  function resolveAlert(state, movimentoId) {
    const movimento = findById(state.movimentos, movimentoId);
    if (movimento && movimento.situacao === "sem_liberacao") movimento.alertaResolvido = true;
    return movimento;
  }

  function markNotificationsRead(state, responsavelId, alunoId) {
    state.notificacoes.forEach((notificacao) => {
      if (notificacao.responsavelId === responsavelId && notificacao.alunoId === alunoId) {
        notificacao.lida = true;
      }
    });
  }

  /* ------------------------------------------------------------------ */
  /* Geração dos dados de demonstração                                   */
  /* ------------------------------------------------------------------ */

  // Gerador pseudoaleatório com semente: os dados iniciais são sempre iguais.
  function createRandom(seed) {
    let value = seed;
    return function next() {
      value = (value + 0x6d2b79f5) | 0;
      let t = Math.imul(value ^ (value >>> 15), 1 | value);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function recentSchoolDays(now, amount) {
    const days = [];
    let cursor = new Date(now);
    while (days.length < amount) {
      if (!time.isWeekend(cursor)) days.push(time.toDateKey(cursor));
      cursor = time.addDays(cursor, -1);
    }
    return days; // days[0] é o dia letivo mais recente (hoje, se for dia útil)
  }

  // daysAgo indica a posição em recentSchoolDays (0 = dia letivo mais recente).
  const SEED_SPECIAL_EXITS = [
    { daysAgo: 3, alunoId: "a1", saida: "09:40", pedido: { horario: "09:30", motivo: "Consulta médica agendada no posto de saúde." } },
    { daysAgo: 2, alunoId: "a4", saida: "10:12", pedido: { horario: "10:00", motivo: "Coleta de exame de sangue em laboratório." } },
    { daysAgo: 1, alunoId: "a6", saida: "15:05", resolvido: true },
    { daysAgo: 0, alunoId: "a3", saida: "10:05", resolvido: false },
    { daysAgo: 0, alunoId: "a5", saida: "15:20", resolvido: false },
  ];

  const SEED_REFUSED_REQUEST = {
    daysAgo: 2,
    alunoId: "a3",
    horario: "10:00",
    motivo: "Viagem em família no fim de semana prolongado.",
    justificativa: "Dia de avaliação presencial. Procure a coordenação para remarcar.",
  };

  const SEED_UPCOMING_REQUESTS = [
    { alunoId: "a1", horario: "10:00", motivo: "Consulta odontológica marcada há um mês." },
    { alunoId: "a3", horario: "09:30", motivo: "Retirada da carteira de identidade no Vapt Vupt." },
    { alunoId: "a6", horario: "16:00", motivo: "Acompanhar a avó em consulta médica." },
    { alunoId: "a2", horario: "15:30", motivo: "Jogo do campeonato estadual de vôlei.", aprovada: true },
  ];

  function seedSpecialRequest(state, special, dateKey) {
    const aluno = catalog.getAluno(special.alunoId);
    const dayBefore = time.addDays(time.fromKeys(dateKey, "19:20"), -1).getTime();
    const solicitacao = createRequest(
      state,
      {
        alunoId: aluno.id,
        responsavelId: aluno.responsavelId,
        data: dateKey,
        horario: special.pedido.horario,
        motivo: special.pedido.motivo,
      },
      { criadaEm: dayBefore }
    );
    decideRequest(state, solicitacao.id, "aprovada", "", time.fromKeys(dateKey, "07:40").getTime(), true);
    return solicitacao;
  }

  function buildSeedData(now = new Date()) {
    const state = { versao: DATA_VERSION, movimentos: [], solicitacoes: [], notificacoes: [] };
    const random = createRandom(2026);
    const nowMs = now.getTime();
    const todayKey = time.toDateKey(now);
    const schoolDays = recentSchoolDays(now, SEED_SCHOOL_DAYS);

    [...schoolDays].reverse().forEach((dateKey) => {
      const daysAgo = schoolDays.indexOf(dateKey);
      const isPastDay = dateKey !== todayKey;

      ALUNOS.forEach((aluno) => {
        const turma = catalog.getTurma(aluno.turmaId);
        const special = SEED_SPECIAL_EXITS.find(
          (item) => item.daysAgo === daysAgo && item.alunoId === aluno.id
        );
        const absent = random() < ABSENCE_PROBABILITY;
        if (absent && !special) return;

        const entradaMin = time.minutesOf(turma.inicio) - 15 + Math.floor(random() * 25);
        const entrada = time.fromKeys(dateKey, time.fromMinutes(entradaMin)).getTime();
        if (entrada > nowMs) return;
        appendMovement(state, { alunoId: aluno.id, tipo: "entrada", situacao: "entrada", timestamp: entrada }, { lida: isPastDay });

        let saidaKey = time.fromMinutes(time.minutesOf(turma.fim) + Math.floor(random() * 12));
        let situacao = "regular";
        let solicitacaoId = null;

        if (special) {
          saidaKey = special.saida;
          if (special.pedido) {
            const solicitacao = seedSpecialRequest(state, special, dateKey);
            solicitacao.utilizadaEm = time.fromKeys(dateKey, saidaKey).getTime();
            situacao = "autorizada";
            solicitacaoId = solicitacao.id;
          } else {
            situacao = "sem_liberacao";
          }
        }

        const saida = time.fromKeys(dateKey, saidaKey).getTime();
        if (saida > nowMs) return;
        appendMovement(
          state,
          { alunoId: aluno.id, tipo: "saida", situacao, timestamp: saida, solicitacaoId },
          { lida: isPastDay, alertaResolvido: special ? special.resolvido : false }
        );
      });
    });

    const refusedDay = schoolDays[SEED_REFUSED_REQUEST.daysAgo];
    const refused = createRequest(
      state,
      {
        alunoId: SEED_REFUSED_REQUEST.alunoId,
        responsavelId: catalog.getAluno(SEED_REFUSED_REQUEST.alunoId).responsavelId,
        data: refusedDay,
        horario: SEED_REFUSED_REQUEST.horario,
        motivo: SEED_REFUSED_REQUEST.motivo,
      },
      { criadaEm: time.addDays(time.fromKeys(refusedDay, "20:05"), -1).getTime() }
    );
    decideRequest(state, refused.id, "recusada", SEED_REFUSED_REQUEST.justificativa, time.fromKeys(refusedDay, "07:35").getTime(), true);

    const upcomingDay = time.toDateKey(time.nextSchoolDay(now));
    SEED_UPCOMING_REQUESTS.forEach((item, index) => {
      const aluno = catalog.getAluno(item.alunoId);
      const solicitacao = createRequest(
        state,
        { alunoId: aluno.id, responsavelId: aluno.responsavelId, data: upcomingDay, horario: item.horario, motivo: item.motivo },
        { criadaEm: nowMs - (index + 1) * 47 * 60 * 1000 }
      );
      if (item.aprovada) decideRequest(state, solicitacao.id, "aprovada", "", nowMs - 20 * 60 * 1000, true);
    });

    return state;
  }

  /* ------------------------------------------------------------------ */
  /* Armazenamento local e sincronização entre abas                      */
  /* ------------------------------------------------------------------ */

  let cachedState = null;
  const listeners = new Set();

  function readStoredState() {
    try {
      const raw = window.localStorage.getItem(DATA_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && parsed.versao === DATA_VERSION ? parsed : null;
    } catch (error) {
      return null;
    }
  }

  function persist(state) {
    try {
      window.localStorage.setItem(DATA_KEY, JSON.stringify(state));
    } catch (error) {
      // Sem localStorage (ex.: navegação privada restrita), os dados ficam só em memória.
    }
  }

  function emit(detail) {
    listeners.forEach((listener) => listener(detail));
  }

  const data = {
    getState() {
      if (!cachedState) {
        cachedState = readStoredState();
        if (!cachedState) {
          cachedState = buildSeedData();
          persist(cachedState);
        }
      }
      return cachedState;
    },
    /** Aplica uma alteração, salva no localStorage e atualiza a interface. */
    commit(mutator) {
      cachedState = readStoredState() || data.getState();
      const result = mutator(cachedState);
      persist(cachedState);
      emit({ external: false });
      return result;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    reset() {
      cachedState = buildSeedData();
      persist(cachedState);
      emit({ external: false, reset: true });
    },
  };

  // O evento "storage" só dispara nas OUTRAS abas do mesmo navegador.
  window.addEventListener("storage", (event) => {
    if (event.key !== DATA_KEY && event.key !== null) return;
    cachedState = null;
    emit({ external: true });
  });

  const domain = {
    appendMovement,
    createRequest,
    decideRequest,
    cancelRequest,
    resolveAlert,
    markNotificationsRead,
  };

  /* ------------------------------------------------------------------ */
  /* Sessão simulada                                                     */
  /* ------------------------------------------------------------------ */

  // sessionStorage é isolado por aba: permite abrir um perfil em cada aba.
  const auth = {
    login(role, email, senha) {
      const source = role === "institucional" ? USUARIOS_INSTITUCIONAIS : RESPONSAVEIS;
      const normalizedEmail = email.trim().toLowerCase();
      const user = source.find((item) => item.email === normalizedEmail && item.senha === senha);
      if (!user) return null;
      try {
        window.sessionStorage.setItem(SESSION_KEY, JSON.stringify({ role, userId: user.id }));
      } catch (error) {
        return null;
      }
      return user;
    },
    getSession() {
      try {
        return JSON.parse(window.sessionStorage.getItem(SESSION_KEY));
      } catch (error) {
        return null;
      }
    },
    currentUser() {
      const session = auth.getSession();
      if (!session) return null;
      const source = session.role === "institucional" ? USUARIOS_INSTITUCIONAIS : RESPONSAVEIS;
      return findById(source, session.userId);
    },
    homeFor: (role) => (role === "institucional" ? "institucional.html" : "responsavel.html"),
    /** Redireciona para o login se a aba não estiver conectada com o perfil esperado. */
    requireRole(role) {
      const session = auth.getSession();
      if (session && session.role === role && auth.currentUser()) return session;
      window.location.replace("index.html?acesso=restrito");
      return null;
    },
    logout() {
      try {
        window.sessionStorage.removeItem(SESSION_KEY);
        window.sessionStorage.removeItem(SELECTED_STUDENT_KEY);
      } catch (error) {
        // Nada a limpar.
      }
      window.location.href = "index.html?saiu=1";
    },
    demoAccounts(role) {
      if (role === "institucional") {
        return USUARIOS_INSTITUCIONAIS.map((user) => ({ ...user, detalhe: "Acesso ao painel da instituição" }));
      }
      return RESPONSAVEIS.filter((user) => user.email).map((user) => ({
        ...user,
        detalhe: catalog.alunosDoResponsavel(user.id).map((aluno) => aluno.nome).join(", "),
      }));
    },
  };

  /* ------------------------------------------------------------------ */
  /* Utilitários de interface                                            */
  /* ------------------------------------------------------------------ */

  const ICONS = {
    entrada: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="m10 17 5-5-5-5"/><path d="M15 12H3"/>',
    saida: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    check: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
    alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    x: '<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>',
    bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
    fingerprint: '<path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
    send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    building: '<path d="M3 10 12 4l9 6"/><path d="M5 10v9M9.5 10v9M14.5 10v9M19 10v9M3 20h18"/>',
    history: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l4 2"/>',
    clipboard: '<rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    close: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    thumbsUp: '<path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z"/>',
    thumbsDown: '<path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z"/>',
    menu: '<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    printer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    layout: '<rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/>',
    sort: '<path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/>',
    sortAsc: '<path d="m7 14 5-5 5 5"/>',
    sortDesc: '<path d="m7 10 5 5 5-5"/>',
    form: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><path d="M14 2v6h6"/><path d="M8 13h8"/><path d="M8 17h5"/>',
  };

  const TONE_ICON = { info: "info", success: "check", warning: "clock", danger: "alert", neutral: "info" };

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function icon(name, className = "icon") {
    return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ""}</svg>`;
  }

  function badge(meta, labelOverride) {
    return `<span class="badge badge--${meta.tone}">${icon(meta.icon)}${escapeHtml(labelOverride || meta.label)}</span>`;
  }

  function requestBadge(solicitacao) {
    const meta = REQUEST_STATUS[solicitacao.status];
    const label = solicitacao.status === "aprovada" && solicitacao.utilizadaEm ? "Aprovada · utilizada" : meta.label;
    return badge(meta, label);
  }

  function emptyState(title, text = "") {
    return `<div class="empty-state">${icon("inbox")}<p><strong>${escapeHtml(title)}</strong>${text ? `<span>${escapeHtml(text)}</span>` : ""}</p></div>`;
  }

  function initials(name) {
    return name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("");
  }

  function getToastRegion() {
    let region = document.getElementById("toastRegion");
    if (!region) {
      region = document.createElement("div");
      region.id = "toastRegion";
      region.className = "toast-region";
      document.body.append(region);
    }
    return region;
  }

  function toast(message, { title = "", tone = "info" } = {}) {
    const item = document.createElement("div");
    item.className = `toast toast--${tone}`;
    item.setAttribute("role", tone === "danger" ? "alert" : "status");
    item.innerHTML = `
      ${icon(TONE_ICON[tone])}
      <div class="toast__body">
        ${title ? `<strong>${escapeHtml(title)}</strong>` : ""}
        <p>${escapeHtml(message)}</p>
      </div>
      <button class="toast__close" type="button" aria-label="Fechar aviso">${icon("close")}</button>`;

    const remove = () => item.remove();
    item.querySelector(".toast__close").addEventListener("click", remove);
    const region = getToastRegion();
    region.append(item);
    while (region.children.length > MAX_VISIBLE_TOASTS) region.firstElementChild.remove();
    window.setTimeout(remove, tone === "danger" ? 9000 : 5500);
  }

  /* ---------- Tabela com busca, ordenação, paginação e exportação ---------- */

  const PAGE_SIZES = [10, 25, 50];
  const MOBILE_QUERY = window.matchMedia("(max-width: 900px)");

  function normalizeText(value) {
    return String(value ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function downloadCsv(filename, columns, rows) {
    const exportable = columns.filter((column) => column.csv);
    const lines = [
      exportable.map((column) => csvCell(column.label)).join(";"),
      ...rows.map((row) => exportable.map((column) => csvCell(column.csv(row))).join(";")),
    ];
    // BOM + ";" para o Excel em português abrir os acentos e as colunas corretamente.
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}-${time.todayKey()}.csv`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  /**
   * Cria uma tabela de dados no contêiner informado.
   * columns: [{ key, label, render(row), sortValue(row), csv(row), sortable }]
   */
  function createDataTable(container, options) {
    const {
      columns,
      exportName = "registros",
      searchText = () => "",
      emptyTitle = "Nenhum registro encontrado",
      emptyText = "",
      rowClass = () => "",
      defaultSort = null,
    } = options;

    const state = {
      rows: [],
      query: "",
      page: 1,
      pageSize: PAGE_SIZES[0],
      sortKey: defaultSort ? defaultSort.key : null,
      sortDir: defaultSort ? defaultSort.dir : "asc",
    };
    const uid = createId("dt");

    container.classList.add("dt");
    container.innerHTML = `
      <div class="dt__toolbar">
        <label class="dt__length">Mostrar
          <select aria-label="Registros por página">
            ${PAGE_SIZES.map((size) => `<option value="${size}">${size}</option>`).join("")}
          </select>
          registros
        </label>
        <div class="dt__tools">
          <button class="tool-button" type="button" data-dt="csv">${icon("download")}Exportar Excel (CSV)</button>
          <button class="tool-button" type="button" data-dt="print">${icon("printer")}Imprimir</button>
        </div>
        <label class="dt__search" for="${uid}-search">Buscar
          <input id="${uid}-search" type="search" autocomplete="off">
        </label>
      </div>
      <div class="dt__scroll">
        <table class="data-table">
          <thead><tr>${columns
            .map((column) =>
              column.sortable === false
                ? `<th scope="col">${escapeHtml(column.label)}</th>`
                : `<th scope="col" data-key="${column.key}" aria-sort="none">
                     <button class="dt__sort" type="button" data-sort="${column.key}">
                       ${escapeHtml(column.label)}<span class="dt__sort-icon">${icon("sort")}</span>
                     </button>
                   </th>`
            )
            .join("")}</tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="dt__footer">
        <p class="dt__info" aria-live="polite"></p>
        <nav class="pagination" aria-label="Paginação"></nav>
      </div>`;

    const tbody = container.querySelector("tbody");
    const info = container.querySelector(".dt__info");
    const pagination = container.querySelector(".pagination");
    const searchInput = container.querySelector("input[type=search]");
    const lengthSelect = container.querySelector(".dt__length select");

    function visibleRows() {
      const query = normalizeText(state.query.trim());
      let rows = query ? state.rows.filter((row) => normalizeText(searchText(row)).includes(query)) : [...state.rows];
      const column = columns.find((item) => item.key === state.sortKey);
      if (column) {
        const getValue = column.sortValue || ((row) => normalizeText(column.csv ? column.csv(row) : ""));
        const direction = state.sortDir === "asc" ? 1 : -1;
        rows.sort((a, b) => {
          const valueA = getValue(a);
          const valueB = getValue(b);
          if (valueA < valueB) return -direction;
          if (valueA > valueB) return direction;
          return 0;
        });
      }
      return rows;
    }

    function renderHeader() {
      container.querySelectorAll("th[data-key]").forEach((th) => {
        const active = th.dataset.key === state.sortKey;
        th.setAttribute("aria-sort", active ? (state.sortDir === "asc" ? "ascending" : "descending") : "none");
        th.querySelector(".dt__sort-icon").innerHTML = icon(active ? (state.sortDir === "asc" ? "sortAsc" : "sortDesc") : "sort");
      });
    }

    function renderPagination(totalPages) {
      const pages = [];
      const from = Math.max(1, state.page - 2);
      const to = Math.min(totalPages, from + 4);
      for (let page = from; page <= to; page += 1) pages.push(page);
      pagination.innerHTML = `
        <button type="button" data-page="${state.page - 1}" ${state.page <= 1 ? "disabled" : ""}>← Anterior</button>
        ${pages
          .map(
            (page) =>
              `<button type="button" data-page="${page}" ${page === state.page ? 'aria-current="page" class="is-current"' : ""}>${page}</button>`
          )
          .join("")}
        <button type="button" data-page="${state.page + 1}" ${state.page >= totalPages ? "disabled" : ""}>Próxima →</button>`;
    }

    function render() {
      const rows = visibleRows();
      const totalPages = Math.max(1, Math.ceil(rows.length / state.pageSize));
      state.page = Math.min(Math.max(1, state.page), totalPages);
      const start = (state.page - 1) * state.pageSize;
      const pageRows = rows.slice(start, start + state.pageSize);

      tbody.innerHTML = pageRows.length
        ? pageRows
            .map(
              (row) => `<tr class="${rowClass(row)}">${columns
                .map(
                  (column) =>
                    `<td data-label="${escapeHtml(column.label)}" class="${column.className || ""}"><div class="cell">${column.render(row)}</div></td>`
                )
                .join("")}</tr>`
            )
            .join("")
        : `<tr class="dt__empty"><td colspan="${columns.length}">${emptyState(
            state.query ? "Nenhum resultado para a busca" : emptyTitle,
            state.query ? "Revise o termo digitado ou limpe a busca." : emptyText
          )}</td></tr>`;

      info.textContent = rows.length
        ? `Mostrando registro(s) de ${start + 1} a ${start + pageRows.length} do total de ${rows.length} registro(s)` +
          (state.query ? ` (filtrados de ${state.rows.length})` : "")
        : "Nenhum registro para exibir";
      renderHeader();
      renderPagination(totalPages);
    }

    container.addEventListener("click", (event) => {
      const sortButton = event.target.closest("[data-sort]");
      if (sortButton) {
        const key = sortButton.dataset.sort;
        state.sortDir = state.sortKey === key && state.sortDir === "asc" ? "desc" : "asc";
        state.sortKey = key;
        render();
        return;
      }
      const pageButton = event.target.closest("[data-page]");
      if (pageButton && !pageButton.disabled) {
        state.page = Number(pageButton.dataset.page);
        render();
        return;
      }
      const tool = event.target.closest("[data-dt]");
      if (tool && tool.dataset.dt === "csv") downloadCsv(exportName, columns, visibleRows());
      if (tool && tool.dataset.dt === "print") window.print();
    });

    searchInput.addEventListener("input", () => {
      state.query = searchInput.value;
      state.page = 1;
      render();
    });

    lengthSelect.addEventListener("change", () => {
      state.pageSize = Number(lengthSelect.value);
      state.page = 1;
      render();
    });

    return {
      setRows(rows) {
        state.rows = rows;
        render();
      },
    };
  }

  /* ---------- Estrutura do painel: menu lateral e seções ---------- */

  function initShell({ onSectionChange } = {}) {
    const body = document.body;
    const toggle = document.getElementById("menuToggle");
    const backdrop = document.getElementById("sidebarBackdrop");
    const links = [...document.querySelectorAll("[data-nav]")];
    const sections = [...document.querySelectorAll("[data-view]")];
    const defaultView = sections[0].dataset.view;

    function setMenuOpen(open) {
      const className = MOBILE_QUERY.matches ? "nav-open" : "nav-collapsed";
      const applied = MOBILE_QUERY.matches ? open : !open;
      body.classList.toggle(className, applied);
      toggle.setAttribute("aria-expanded", String(open));
    }

    function isMenuOpen() {
      return MOBILE_QUERY.matches ? body.classList.contains("nav-open") : !body.classList.contains("nav-collapsed");
    }

    toggle.addEventListener("click", () => setMenuOpen(!isMenuOpen()));
    backdrop.addEventListener("click", () => setMenuOpen(false));
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && MOBILE_QUERY.matches && isMenuOpen()) {
        setMenuOpen(false);
        toggle.focus();
      }
    });
    MOBILE_QUERY.addEventListener("change", () => {
      body.classList.remove("nav-open", "nav-collapsed");
      toggle.setAttribute("aria-expanded", String(!MOBILE_QUERY.matches));
    });
    toggle.setAttribute("aria-expanded", String(!MOBILE_QUERY.matches));

    function show(view, { focus = false } = {}) {
      const target = sections.find((section) => section.dataset.view === view) ? view : defaultView;
      sections.forEach((section) => {
        section.hidden = section.dataset.view !== target;
      });
      links.forEach((link) => {
        if (link.dataset.nav === target) link.setAttribute("aria-current", "page");
        else link.removeAttribute("aria-current");
      });
      if (MOBILE_QUERY.matches) setMenuOpen(false);
      if (focus) {
        const heading = document.querySelector(`[data-view="${target}"] h1`);
        if (heading) heading.focus();
      }
      if (onSectionChange) onSectionChange(target);
    }

    window.addEventListener("hashchange", () => show(window.location.hash.slice(1), { focus: true }));
    show(window.location.hash.slice(1));

    return {
      go(view) {
        if (window.location.hash.slice(1) === view) show(view, { focus: true });
        else window.location.hash = view;
      },
    };
  }

  function setupHeader(user) {
    const nameEl = document.getElementById("userName");
    const avatarEl = document.getElementById("userAvatar");
    const resetEl = document.getElementById("resetDemo");
    if (nameEl) nameEl.textContent = user.nome;
    if (avatarEl) avatarEl.textContent = initials(user.nome);
    document.querySelectorAll("[data-logout]").forEach((button) => button.addEventListener("click", auth.logout));
    if (resetEl) {
      resetEl.addEventListener("click", () => {
        const confirmed = window.confirm(
          "Restaurar os dados de demonstração? Solicitações e eventos criados durante o teste serão apagados."
        );
        if (!confirmed) return;
        data.reset();
        toast("Os dados fictícios voltaram ao estado inicial.", { title: "Demonstração restaurada", tone: "success" });
      });
    }
  }

  const ui = {
    escapeHtml,
    icon,
    badge,
    requestBadge,
    emptyState,
    initials,
    toast,
    setupHeader,
    initShell,
    createDataTable,
  };

  /* ------------------------------------------------------------------ */
  /* Tela de login                                                       */
  /* ------------------------------------------------------------------ */

  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ROLE_LABEL = { institucional: "Institucional", responsavel: "Responsável" };

  function setFieldError(input, message) {
    const errorEl = document.getElementById(`${input.id}Error`);
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (errorEl) errorEl.textContent = message;
  }

  function initLoginPage() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    const emailInput = document.getElementById("loginEmail");
    const passwordInput = document.getElementById("loginPassword");
    const formError = document.getElementById("loginError");
    const accountsList = document.getElementById("demoAccounts");
    const statusEl = document.getElementById("loginStatus");
    const submitButton = form.querySelector("[type=submit]");
    const selectedRole = () => form.querySelector("input[name=perfil]:checked").value;

    const params = new URLSearchParams(window.location.search);
    if (params.has("acesso")) statusEl.textContent = "Entre com o perfil correspondente para acessar esse painel.";
    if (params.has("saiu")) statusEl.textContent = "Você saiu da conta.";

    const session = auth.getSession();
    const user = auth.currentUser();
    if (session && user) {
      statusEl.innerHTML = `Esta aba já está conectada como <strong>${escapeHtml(user.nome)}</strong>. <a href="${auth.homeFor(session.role)}">Ir para o painel</a>`;
    }

    function renderAccounts() {
      const role = selectedRole();
      accountsList.innerHTML = auth
        .demoAccounts(role)
        .map(
          (account) => `
          <li class="demo-account">
            <span class="demo-account__avatar" aria-hidden="true">${escapeHtml(initials(account.nome))}</span>
            <span class="demo-account__text">
              <strong>${escapeHtml(account.nome)}</strong>
              <small>${escapeHtml(account.email)} · senha ${escapeHtml(account.senha)}</small>
              <small>${role === "responsavel" ? "Alunos: " : ""}${escapeHtml(account.detalhe)}</small>
            </span>
            <button class="chip-button" type="button" data-email="${escapeHtml(account.email)}" data-senha="${escapeHtml(account.senha)}">
              Usar conta
            </button>
          </li>`
        )
        .join("");
    }

    form.addEventListener("change", (event) => {
      if (event.target.name !== "perfil") return;
      formError.textContent = "";
      renderAccounts();
    });

    accountsList.addEventListener("click", (event) => {
      const button = event.target.closest("[data-email]");
      if (!button) return;
      emailInput.value = button.dataset.email;
      passwordInput.value = button.dataset.senha;
      setFieldError(emailInput, "");
      setFieldError(passwordInput, "");
      formError.textContent = "";
      submitButton.focus();
    });

    [emailInput, passwordInput].forEach((input) =>
      input.addEventListener("input", () => setFieldError(input, ""))
    );

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      formError.textContent = "";

      const email = emailInput.value.trim();
      const senha = passwordInput.value;
      let valid = true;

      if (!email) {
        setFieldError(emailInput, "Informe o e-mail.");
        valid = false;
      } else if (!EMAIL_PATTERN.test(email)) {
        setFieldError(emailInput, "Use um e-mail no formato nome@dominio.com.");
        valid = false;
      }
      if (!senha) {
        setFieldError(passwordInput, "Informe a senha.");
        valid = false;
      }
      if (!valid) {
        form.querySelector("[aria-invalid=true]").focus();
        return;
      }

      const role = selectedRole();
      const loggedUser = auth.login(role, email, senha);
      if (!loggedUser) {
        formError.textContent = `E-mail ou senha não conferem para o perfil ${ROLE_LABEL[role]}. Confira as contas fictícias abaixo.`;
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = "Entrando…";
      window.location.href = auth.homeFor(role);
    });

    renderAccounts();
  }

  window.SC = {
    constants: { AUTHORIZATION_TOLERANCE_MINUTES, MAX_REQUEST_DAYS_AHEAD, SELECTED_STUDENT_KEY },
    MOVEMENT_STATUS,
    REQUEST_STATUS,
    catalog,
    time,
    data,
    domain,
    auth,
    ui,
  };

  // Substitui <span data-icon="nome"> pelos ícones SVG do catálogo.
  function hydrateIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((element) => {
      element.innerHTML = icon(element.dataset.icon);
      element.classList.add("icon-slot");
      element.setAttribute("aria-hidden", "true");
    });
  }

  ui.hydrateIcons = hydrateIcons;
  hydrateIcons();
  document.addEventListener("DOMContentLoaded", initLoginPage);
})();
