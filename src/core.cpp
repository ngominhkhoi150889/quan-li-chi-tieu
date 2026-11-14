// Sổ chi tiêu - core xử lý dữ liệu, biên dịch sang WebAssembly bằng Emscripten.
#include <emscripten/bind.h>
#include <emscripten/val.h>

#include <algorithm>
#include <cmath>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace {

struct Entry {
  int id;
  std::string name;
  double qty;
  double price;
};

std::vector<Entry> g_entries;
int g_nextId = 1;

double amountOf(const Entry& entry) { return entry.qty * entry.price; }

std::string trim(const std::string& text) {
  constexpr const char* kWhitespace = " \t\n\r\f\v";
  const auto start = text.find_first_not_of(kWhitespace);
  if (start == std::string::npos) return {};
  const auto end = text.find_last_not_of(kWhitespace);
  return text.substr(start, end - start + 1);
}

bool isValid(double qty, double price) {
  return std::isfinite(qty) && std::isfinite(price) && qty > 0.0 && price >= 0.0;
}

emscripten::val toJs(const Entry& entry) {
  emscripten::val object = emscripten::val::object();
  object.set("id", entry.id);
  object.set("name", entry.name);
  object.set("qty", entry.qty);
  object.set("price", entry.price);
  object.set("amount", amountOf(entry));
  return object;
}

}  // namespace

int addEntry(std::string name, double qty, double price) {
  name = trim(name);
  if (name.empty() || name.size() > 120 || !isValid(qty, price)) return -1;

  const int id = g_nextId++;
  g_entries.push_back({id, std::move(name), qty, price});
  return id;
}

bool removeEntry(int id) {
  const auto it = std::find_if(g_entries.begin(), g_entries.end(),
                               [id](const Entry& entry) { return entry.id == id; });
  if (it == g_entries.end()) return false;

  g_entries.erase(it);
  return true;
}

void clearEntries() { g_entries.clear(); }

emscripten::val getEntries() {
  emscripten::val list = emscripten::val::array();
  for (const auto& entry : g_entries) {
    list.call<void>("push", toJs(entry));
  }
  return list;
}

emscripten::val getStats() {
  double total = 0.0;
  double totalQty = 0.0;
  double maxAmount = 0.0;
  std::string maxName;

  for (const auto& entry : g_entries) {
    const double amount = amountOf(entry);
    total += amount;
    totalQty += entry.qty;
    if (amount > maxAmount) {
      maxAmount = amount;
      maxName = entry.name;
    }
  }

  emscripten::val stats = emscripten::val::object();
  stats.set("count", static_cast<int>(g_entries.size()));
  stats.set("total", total);
  stats.set("totalQty", totalQty);
  stats.set("average", g_entries.empty() ? 0.0 : total / g_entries.size());
  stats.set("maxAmount", maxAmount);
  stats.set("maxName", maxName);
  return stats;
}

emscripten::val getBreakdown() {
  struct Aggregate {
    double qty = 0.0;
    double amount = 0.0;
    int count = 0;
  };

  std::unordered_map<std::string, Aggregate> byName;
  for (const auto& entry : g_entries) {
    Aggregate& aggregate = byName[entry.name];
    aggregate.qty += entry.qty;
    aggregate.amount += amountOf(entry);
    aggregate.count += 1;
  }

  std::vector<std::pair<std::string, Aggregate>> rows(byName.begin(), byName.end());
  std::sort(rows.begin(), rows.end(), [](const auto& lhs, const auto& rhs) {
    if (lhs.second.amount != rhs.second.amount) {
      return lhs.second.amount > rhs.second.amount;
    }
    return lhs.first < rhs.first;
  });

  emscripten::val list = emscripten::val::array();
  for (const auto& [name, aggregate] : rows) {
    emscripten::val row = emscripten::val::object();
    row.set("name", name);
    row.set("qty", aggregate.qty);
    row.set("amount", aggregate.amount);
    row.set("count", aggregate.count);
    list.call<void>("push", row);
  }
  return list;
}

std::string coreVersion() { return "1.0.0"; }

EMSCRIPTEN_BINDINGS(expense_core) {
  emscripten::function("addEntry", &addEntry);
  emscripten::function("removeEntry", &removeEntry);
  emscripten::function("clearEntries", &clearEntries);
  emscripten::function("getEntries", &getEntries);
  emscripten::function("getStats", &getStats);
  emscripten::function("getBreakdown", &getBreakdown);
  emscripten::function("coreVersion", &coreVersion);
}
