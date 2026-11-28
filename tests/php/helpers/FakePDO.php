<?php
/**
 * Zero-dependency FakePDO & FakeStmt untuk unit testing model & controller PHP native
 */

class FakeStmt extends PDOStatement {
    private FakePDO $pdo;
    private string $sql;
    private array $boundParams = [];
    private array $rows = [];
    private int $cursor = 0;
    private int $affectedRows = 0;

    public function __construct(FakePDO $pdo, string $sql) {
        $this->pdo = $pdo;
        $this->sql = $sql;
    }

    public function bindValue(string|int $param, mixed $value, int $type = PDO::PARAM_STR): bool {
        $this->boundParams[$param] = $value;
        return true;
    }

    public function execute(?array $params = null): bool {
        $mergedParams = $this->boundParams;
        if ($params !== null) {
            foreach ($params as $k => $v) {
                $mergedParams[$k] = $v;
            }
        }

        $result = $this->pdo->recordAndResolve($this->sql, $mergedParams);
        $this->rows = $result['rows'];
        $this->affectedRows = $result['rowCount'];
        $this->cursor = 0;
        return true;
    }

    public function fetch(int $mode = PDO::FETCH_DEFAULT, int $cursorOrientation = PDO::FETCH_ORI_NEXT, int $cursorOffset = 0): mixed {
        if (!isset($this->rows[$this->cursor])) {
            return false;
        }
        return $this->rows[$this->cursor++];
    }

    public function fetchAll(int $mode = PDO::FETCH_DEFAULT, mixed ...$args): array {
        return $this->rows;
    }

    public function fetchColumn(int $column = 0): mixed {
        $row = $this->fetch();
        if ($row === false) {
            return false;
        }
        $values = array_values($row);
        return $values[$column] ?? false;
    }

    public function rowCount(): int {
        return $this->affectedRows;
    }
}

class FakePDO extends PDO {
    /** @var array<int, array{sql: string, params: array}> */
    public array $queries = [];

    /** @var array<int, array{rows: array, rowCount: int, lastInsertId: string}> */
    private array $queuedResults = [];

    /** @var callable|null */
    private $responder = null;

    private string $lastId = '1';
    private bool $inTx = false;

    public function __construct() {
        // Sengaja tidak memanggil parent::__construct() agar tidak butuh koneksi DB nyata
    }

    public function setResponder(callable $responder): void {
        $this->responder = $responder;
    }

    public function queueResult(array $rows, int $rowCount = -1, string $lastInsertId = '1'): void {
        $this->queuedResults[] = [
            'rows'         => $rows,
            'rowCount'     => $rowCount >= 0 ? $rowCount : count($rows),
            'lastInsertId' => $lastInsertId,
        ];
    }

    public function prepare(string $query, array $options = []): PDOStatement|false {
        return new FakeStmt($this, $query);
    }

    public function recordAndResolve(string $sql, array $params): array {
        $this->queries[] = [
            'sql'    => $sql,
            'params' => $params,
        ];

        if ($this->responder !== null) {
            $res = ($this->responder)($sql, $params);
            if (is_array($res) && array_key_exists('rows', $res)) {
                if (isset($res['lastInsertId'])) {
                    $this->lastId = (string)$res['lastInsertId'];
                }
                return [
                    'rows'     => $res['rows'],
                    'rowCount' => $res['rowCount'] ?? count($res['rows']),
                ];
            }
            $rows = is_array($res) ? $res : [];
            return [
                'rows'     => $rows,
                'rowCount' => count($rows),
            ];
        }

        if (!empty($this->queuedResults)) {
            $next = array_shift($this->queuedResults);
            $this->lastId = $next['lastInsertId'];
            return [
                'rows'     => $next['rows'],
                'rowCount' => $next['rowCount'],
            ];
        }

        return [
            'rows'     => [],
            'rowCount' => 0,
        ];
    }

    public function lastInsertId(?string $name = null): string|false {
        return $this->lastId;
    }

    public function beginTransaction(): bool {
        $this->inTx = true;
        return true;
    }

    public function commit(): bool {
        $this->inTx = false;
        return true;
    }

    public function rollBack(): bool {
        $this->inTx = false;
        return true;
    }

    public function inTransaction(): bool {
        return $this->inTx;
    }
}
