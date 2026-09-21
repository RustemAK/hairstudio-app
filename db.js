/**
 * HairStudio Local Database (IndexedDB)
 * Works 100% offline on iOS and Android.
 */

class HairStudioDB {
  constructor() {
    this.dbName = 'HairStudioDB';
    this.dbVersion = 1;
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Appointments store
        if (!db.objectStoreNames.contains('appointments')) {
          const appStore = db.createObjectStore('appointments', { keyPath: 'id', autoIncrement: true });
          appStore.createIndex('date', 'date', { unique: false });
          appStore.createIndex('clientName', 'clientName', { unique: false });
          appStore.createIndex('status', 'status', { unique: false });
        }

        // Services store
        if (!db.objectStoreNames.contains('services')) {
          const servStore = db.createObjectStore('services', { keyPath: 'id', autoIncrement: true });
          servStore.createIndex('category', 'category', { unique: false });
        }

        // Expenses / Materials store
        if (!db.objectStoreNames.contains('expenses')) {
          const expStore = db.createObjectStore('expenses', { keyPath: 'id', autoIncrement: true });
          expStore.createIndex('date', 'date', { unique: false });
          expStore.createIndex('category', 'category', { unique: false });
        }

        // Clients store
        if (!db.objectStoreNames.contains('clients')) {
          const clientStore = db.createObjectStore('clients', { keyPath: 'id', autoIncrement: true });
          clientStore.createIndex('name', 'name', { unique: false });
          clientStore.createIndex('phone', 'phone', { unique: false });
        }
      };

      request.onsuccess = async (event) => {
        this.db = event.target.result;
        await this.checkSeedData();
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB error:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  // Generic transaction helper
  async _tx(storeName, mode, callback) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([storeName], mode);
      const store = transaction.objectStore(storeName);
      const request = callback(store);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  // ================= SERVICES =================
  async getServices() {
    return this._tx('services', 'readonly', (store) => store.getAll());
  }

  async addService(service) {
    return this._tx('services', 'readwrite', (store) => store.add(service));
  }

  async updateService(service) {
    return this._tx('services', 'readwrite', (store) => store.put(service));
  }

  async deleteService(id) {
    return this._tx('services', 'readwrite', (store) => store.delete(Number(id)));
  }

  // ================= EXPENSES / MATERIALS =================
  async getExpenses() {
    return this._tx('expenses', 'readonly', (store) => store.getAll());
  }

  async addExpense(expense) {
    return this._tx('expenses', 'readwrite', (store) => store.add(expense));
  }

  async updateExpense(expense) {
    return this._tx('expenses', 'readwrite', (store) => store.put(expense));
  }

  async deleteExpense(id) {
    return this._tx('expenses', 'readwrite', (store) => store.delete(Number(id)));
  }

  // ================= APPOINTMENTS =================
  async getAppointments() {
    return this._tx('appointments', 'readonly', (store) => store.getAll());
  }

  async getAppointmentsByDate(dateStr) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(['appointments'], 'readonly');
      const store = tx.objectStore('appointments');
      const index = store.index('date');
      const request = index.getAll(dateStr);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async addAppointment(appointment) {
    // Also save or update client
    if (appointment.clientName) {
      await this.saveClientIfNotExists({
        name: appointment.clientName,
        phone: appointment.clientPhone || '',
        notes: appointment.notes || ''
      });
    }
    return this._tx('appointments', 'readwrite', (store) => store.add(appointment));
  }

  async updateAppointment(appointment) {
    return this._tx('appointments', 'readwrite', (store) => store.put(appointment));
  }

  async deleteAppointment(id) {
    return this._tx('appointments', 'readwrite', (store) => store.delete(Number(id)));
  }

  // ================= CLIENTS =================
  async getClients() {
    return this._tx('clients', 'readonly', (store) => store.getAll());
  }

  async saveClientIfNotExists(clientData) {
    const clients = await this.getClients();
    const existing = clients.find(c => 
      (c.phone && clientData.phone && c.phone === clientData.phone) || 
      (c.name.toLowerCase() === clientData.name.toLowerCase())
    );

    if (existing) {
      if (clientData.notes && !existing.notes.includes(clientData.notes)) {
        existing.notes = existing.notes ? `${existing.notes}; ${clientData.notes}` : clientData.notes;
        return this._tx('clients', 'readwrite', (store) => store.put(existing));
      }
      return existing;
    } else {
      const newClient = {
        name: clientData.name,
        phone: clientData.phone || '',
        notes: clientData.notes || '',
        createdAt: new Date().toISOString()
      };
      return this._tx('clients', 'readwrite', (store) => store.add(newClient));
    }
  }

  async updateClient(client) {
    return this._tx('clients', 'readwrite', (store) => store.put(client));
  }

  async deleteClient(id) {
    return this._tx('clients', 'readwrite', (store) => store.delete(Number(id)));
  }

  // ================= EXPORT & IMPORT =================
  async exportAllData() {
    const appointments = await this.getAppointments();
    const services = await this.getServices();
    const expenses = await this.getExpenses();
    const clients = await this.getClients();

    const data = {
      app: 'HairStudio',
      version: 1,
      exportedAt: new Date().toISOString(),
      appointments,
      services,
      expenses,
      clients
    };

    return JSON.stringify(data, null, 2);
  }

  async importAllData(jsonData) {
    const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    if (!data.appointments && !data.services && !data.expenses) {
      throw new Error('Некорректный формат резервной копии');
    }

    await this.clearAll();

    const addList = async (storeName, list) => {
      if (!list || !Array.isArray(list)) return;
      for (const item of list) {
        await this._tx(storeName, 'readwrite', (store) => store.add(item));
      }
    };

    await addList('services', data.services);
    await addList('expenses', data.expenses);
    await addList('clients', data.clients);
    await addList('appointments', data.appointments);
  }

  async clearAll() {
    await this.init();
    const stores = ['appointments', 'services', 'expenses', 'clients'];
    for (const storeName of stores) {
      await this._tx(storeName, 'readwrite', (store) => store.clear());
    }
  }

  // ================= SEED DATA =================
  async checkSeedData() {
    const services = await this.getServices();
    if (services.length === 0) {
      await this.loadSeedData();
    }
  }

  async loadSeedData() {
    const defaultServices = [
      { name: 'Женская стрижка и укладка', category: 'Стрижки', price: 1800, duration: 60 },
      { name: 'Мужская стрижка (fade / классика)', category: 'Стрижки', price: 1200, duration: 45 },
      { name: 'Окрашивание в 1 тон', category: 'Окрашивание', price: 3500, duration: 120 },
      { name: 'Сложное окрашивание (Airtouch / Шатуш)', category: 'Окрашивание', price: 7500, duration: 240 },
      { name: 'Тонирование волос', category: 'Окрашивание', price: 2200, duration: 60 },
      { name: 'Кератиновое выпрямление / Ботокс', category: 'Уход', price: 4500, duration: 150 },
      { name: 'SPA-уход «Счастье для волос»', category: 'Уход', price: 2800, duration: 60 },
      { name: 'Вечерняя / праздничная укладка', category: 'Укладка', price: 2500, duration: 60 },
      { name: 'Оформление и стрижка бороды', category: 'Стрижки', price: 600, duration: 30 }
    ];

    for (const s of defaultServices) {
      await this.addService(s);
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    const defaultExpenses = [
      { date: todayStr, title: 'Краска Matrix Socolor (10 тюбиков)', category: 'Красители', amount: 6800, quantity: '10 шт', notes: 'Оттенки 6N, 7A, 8M, 9V' },
      { date: todayStr, title: 'Оксидант Matrix 6% и 3% (2 литра)', category: 'Красители', amount: 2100, quantity: '2 шт', notes: 'Большие флаконы' },
      { date: todayStr, title: 'Перчатки нитриловые черные L (100 шт)', category: 'Расходники', amount: 850, quantity: '1 уп', notes: 'Плотные' },
      { date: todayStr, title: 'Фольга парикмахерская 100м', category: 'Расходники', amount: 650, quantity: '2 рулона', notes: 'Тисненая 14 мкм' },
      { date: todayStr, title: 'Шампунь и маска L\'Oreal Pro 1500мл', category: 'Уход/Косметика', amount: 4200, quantity: '2 шт', notes: 'Для окрашенных волос' }
    ];

    for (const exp of defaultExpenses) {
      await this.addExpense(exp);
    }

    const defaultAppointments = [
      {
        clientName: 'Анна Смирнова',
        clientPhone: '+7 916 123-45-67',
        date: todayStr,
        startTime: '10:00',
        endTime: '12:00',
        services: [{ name: 'Окрашивание в 1 тон', price: 3500, duration: 120 }],
        totalPrice: 3500,
        status: 'completed',
        materialsUsed: 'Matrix 6N (45г) + оксид 6% (45г)',
        notes: 'Чувствительная кожа головы, наносить аккуратно',
        createdAt: new Date().toISOString()
      },
      {
        clientName: 'Михаил Ковалев',
        clientPhone: '+7 925 987-65-43',
        date: todayStr,
        startTime: '12:30',
        endTime: '13:15',
        services: [{ name: 'Мужская стрижка (fade / классика)', price: 1200, duration: 45 }],
        totalPrice: 1200,
        status: 'completed',
        materialsUsed: 'Воротничок, стайлинг-глина',
        notes: 'Фейд от 1.5 мм, сверху оставить 4 см',
        createdAt: new Date().toISOString()
      },
      {
        clientName: 'Елена Воронина',
        clientPhone: '+7 903 555-11-22',
        date: todayStr,
        startTime: '14:00',
        endTime: '18:00',
        services: [
          { name: 'Сложное окрашивание (Airtouch / Шатуш)', price: 7500, duration: 240 }
        ],
        totalPrice: 7500,
        status: 'scheduled',
        materialsUsed: 'Порошок 90г + оксид 6% 180г + тонер 10V/10P',
        notes: 'Корень натуральный 7.0, переход делать плавным',
        createdAt: new Date().toISOString()
      },
      {
        clientName: 'Дмитрий Соколов',
        clientPhone: '+7 985 333-77-88',
        date: tomorrowStr,
        startTime: '11:00',
        endTime: '12:15',
        services: [
          { name: 'Мужская стрижка (fade / классика)', price: 1200, duration: 45 },
          { name: 'Оформление и стрижка бороды', price: 600, duration: 30 }
        ],
        totalPrice: 1800,
        status: 'scheduled',
        materialsUsed: 'Шейвер, масло для бороды',
        notes: 'Контур бороды ровный, усы подстричь',
        createdAt: new Date().toISOString()
      }
    ];

    for (const app of defaultAppointments) {
      await this.addAppointment(app);
    }
  }
}

// Global instance
window.db = new HairStudioDB();
