# Mito

Трекер задач, таймер с анализом времени, календарь с семантическим зумом и AI-ментор.
План разработки и принятые решения — [docs/ROADMAP.md](docs/ROADMAP.md).

## Запуск

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # проверка типов + production-сборка
npm run lint
```

## Структура

```
src/
  app/        роутер, настройки пользователя, применение темы
  design/     дизайн-токены (tokens.css), глобальные стили, пресеты анимаций
  i18n/       словари RU/EN
  shell/      оболочка: заголовок окна, навигационная панель
  ui/         базовые компоненты (Button, Segmented, SettingRow, Page)
  features/   модули: today, tasks, calendar, stats, mentor, settings
  lib/        утилиты
```
