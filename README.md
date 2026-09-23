# Mito

Трекер задач, таймер с анализом времени, календарь с семантическим зумом и AI-ментор.
План разработки и принятые решения — [docs/ROADMAP.md](docs/ROADMAP.md).

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # проверка типов + production-сборка
npm run lint
npm test           # тесты слоя данных (Vitest + in-memory IndexedDB)
```

## Структура

```
src/
  app/        роутер, настройки пользователя, применение темы
  data/       слой данных: схема Dexie, репозитории (единственный путь записи), живые хуки, бэкап
  design/     дизайн-токены (tokens.css), глобальные стили, пресеты анимаций
  i18n/       словари RU/EN
  shell/      оболочка: заголовок окна, навигационная панель
  ui/         базовые компоненты (Button, Segmented, SettingRow, Page)
  features/   модули: today, tasks, calendar, stats, mentor, settings
  lib/        утилиты
```
