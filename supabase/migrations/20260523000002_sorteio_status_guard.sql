-- Impede INSERT de sorteios em bolões que não estejam EM_ANDAMENTO.
-- Garante a regra a nível de banco, independente da camada de aplicação.

CREATE OR REPLACE FUNCTION check_bolao_em_andamento_para_sorteio()
RETURNS TRIGGER AS $$
DECLARE
  v_status bolao_status;
BEGIN
  SELECT status INTO v_status
  FROM boloes
  WHERE id = NEW.bolao_id;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Bolão % não encontrado', NEW.bolao_id;
  END IF;

  IF v_status <> 'EM_ANDAMENTO' THEN
    RAISE EXCEPTION 'Sorteios só podem ser registrados em bolões EM_ANDAMENTO. Status atual: %', v_status
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sorteio_bolao_em_andamento
  BEFORE INSERT ON sorteios
  FOR EACH ROW
  EXECUTE FUNCTION check_bolao_em_andamento_para_sorteio();
